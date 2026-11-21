"""메르 블로그 새 글 → Claude Code 요약 → 텔레그램 알림.

1회 실행 스크립트. 2분 반복은 윈도우 작업 스케줄러(run_bot.bat)가 담당.
  python mer_bot.py            # 새 글 확인 → 요약 → 전송
  python mer_bot.py --init     # 현재 글 전부 '읽음' 처리 (첫 실행 1회)
  python mer_bot.py --test     # 최신 글 1개 강제 요약·전송
  python mer_bot.py --dry-run  # 전송·저장 없이 콘솔 출력 (--test 와 함께 사용 가능)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
STATE_FILE = BASE_DIR / "state.json"
PROMPT_FILE = BASE_DIR / "prompt.md"
LOG_DIR = BASE_DIR / "logs"

MAX_BODY_CHARS = 15000
MAX_POSTS_PER_RUN = 3
CLAUDE_TIMEOUT_SEC = 120
HTTP_TIMEOUT_SEC = 15
SEEN_KEEP = 300
UA = (
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
)

log = logging.getLogger("mer_bot")


@dataclass
class Post:
    log_no: str
    title: str
    link: str
    description: str


# ---------- 설정 / 상태 ----------

def load_config() -> dict:
    load_dotenv(BASE_DIR / ".env")
    return {
        "blog_id": os.getenv("BLOG_ID", "ranto28").strip(),
        "token": os.getenv("TELEGRAM_BOT_TOKEN", "").strip(),
        "chat_id": os.getenv("TELEGRAM_CHAT_ID", "").strip(),
        "model": os.getenv("CLAUDE_MODEL", "sonnet").strip(),
        "claude_cmd": os.getenv("CLAUDE_CMD", "").strip(),
    }


def load_seen() -> list[str]:
    if not STATE_FILE.exists():
        return []
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8")).get("seen", [])
    except (json.JSONDecodeError, OSError):
        log.warning("state.json 손상 → 빈 상태로 시작")
        return []


def save_seen(seen: list[str]) -> None:
    data = {"seen": seen[-SEEN_KEEP:]}
    STATE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


# ---------- 1. 감지: RSS ----------

def extract_log_no(link: str) -> str | None:
    m = re.search(r"logNo=(\d+)", link) or re.search(r"/(\d{6,})(?:[/?#]|$)", link)
    return m.group(1) if m else None


def parse_rss(xml_text: str) -> list[Post]:
    root = ET.fromstring(xml_text)
    posts = []
    for item in root.iter("item"):
        link = (item.findtext("link") or "").strip()
        log_no = extract_log_no(link)
        if not log_no:
            continue
        desc_html = item.findtext("description") or ""
        posts.append(Post(
            log_no=log_no,
            title=(item.findtext("title") or "(제목 없음)").strip(),
            link=link.split("?")[0],
            description=BeautifulSoup(desc_html, "html.parser").get_text(" ", strip=True),
        ))
    return posts  # RSS는 최신 글이 앞


def fetch_posts(blog_id: str) -> list[Post]:
    url = f"https://rss.blog.naver.com/{blog_id}.xml"
    r = requests.get(url, headers={"User-Agent": UA}, timeout=HTTP_TIMEOUT_SEC)
    r.raise_for_status()
    return parse_rss(r.text)


# ---------- 3. 본문 수집 ----------

def extract_body(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for sel in (".se-main-container", "#viewTypeSelector", "#postViewArea", ".post_ct"):
        node = soup.select_one(sel)
        if node:
            text = node.get_text("\n", strip=True)
            if len(text) > 50:
                return re.sub(r"\n{3,}", "\n\n", text)
    return ""


def fetch_body(blog_id: str, post: Post) -> str:
    try:
        url = f"https://m.blog.naver.com/{blog_id}/{post.log_no}"
        r = requests.get(url, headers={"User-Agent": UA}, timeout=HTTP_TIMEOUT_SEC)
        r.raise_for_status()
        body = extract_body(r.text)
    except requests.RequestException as e:
        log.warning("본문 수집 실패(%s): %s", post.log_no, e)
        body = ""
    if not body:
        log.info("본문 추출 실패 → RSS 요약문 사용 (%s)", post.log_no)
        body = post.description
    return body[:MAX_BODY_CHARS]


# ---------- 4. 요약: Claude Code ----------

def find_claude(cfg: dict) -> str | None:
    # 윈도우에서는 claude.cmd 를 찾아야 하므로 shutil.which 사용
    return cfg["claude_cmd"] or shutil.which("claude")


def summarize(cfg: dict, post: Post, body: str) -> str | None:
    claude = find_claude(cfg)
    if not claude:
        log.error("claude 명령을 찾을 수 없음 (.env 의 CLAUDE_CMD 에 전체 경로 지정)")
        return None
    prompt = PROMPT_FILE.read_text(encoding="utf-8")
    full = f"{prompt}\n\n---\n제목: {post.title}\n\n본문:\n{body}"
    try:
        res = subprocess.run(
            [claude, "-p", "--model", cfg["model"]],
            input=full, capture_output=True, text=True,
            encoding="utf-8", timeout=CLAUDE_TIMEOUT_SEC,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        log.error("Claude 실행 실패: %s", e)
        return None
    out = (res.stdout or "").strip()
    if res.returncode != 0 or not out:
        log.error("Claude 오류(code=%s): %s", res.returncode, (res.stderr or "")[:300])
        return None
    return out


def build_message(post: Post, summary: str | None) -> str:
    head = f"📌 [메르] {post.title}"
    body = summary if summary else "⚠️ 요약 실패 – 원문을 확인하세요."
    return f"{head}\n\n{body}\n\n🔗 {post.link}"


# ---------- 5. 전송: 텔레그램 ----------

def send_telegram(cfg: dict, text: str) -> bool:
    if not cfg["token"] or not cfg["chat_id"]:
        log.error(".env 에 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 가 없음")
        return False
    url = f"https://api.telegram.org/bot{cfg['token']}/sendMessage"
    try:
        r = requests.post(url, data={"chat_id": cfg["chat_id"], "text": text[:4000]},
                          timeout=HTTP_TIMEOUT_SEC)
    except requests.RequestException as e:
        log.error("텔레그램 전송 오류: %s", e)
        return False
    if not r.ok:
        log.error("텔레그램 응답 오류 %s: %s", r.status_code, r.text[:200])
    return r.ok


# ---------- 실행 ----------

def process(cfg: dict, post: Post, dry_run: bool) -> bool:
    body = fetch_body(cfg["blog_id"], post)
    summary = summarize(cfg, post, body)
    msg = build_message(post, summary)
    if dry_run:
        print("=" * 40 + "\n" + msg + "\n" + "=" * 40)
        return True
    return send_telegram(cfg, msg)


def run(args: argparse.Namespace) -> int:
    cfg = load_config()
    try:
        posts = fetch_posts(cfg["blog_id"])
    except (requests.RequestException, ET.ParseError) as e:
        log.error("RSS 조회 실패: %s", e)
        return 1  # 상태 변경 없음 → 다음 주기에 재시도

    if not posts:
        log.info("RSS 에 글이 없음")
        return 0

    seen = load_seen()

    if args.init:
        save_seen(seen + [p.log_no for p in reversed(posts) if p.log_no not in seen])
        log.info("초기화 완료: %d개 글을 '읽음' 처리", len(posts))
        return 0

    if args.test:
        ok = process(cfg, posts[0], args.dry_run)
        log.info("테스트 %s: %s", "성공" if ok else "실패", posts[0].title)
        return 0 if ok else 1

    new_posts = [p for p in reversed(posts) if p.log_no not in seen]  # 오래된 순
    if not new_posts:
        log.info("새 글 없음")
        return 0
    if not seen:
        log.warning("state.json 이 비어 있음 → 먼저 --init 을 실행하세요 (최근 %d개만 처리)",
                    MAX_POSTS_PER_RUN)

    for post in new_posts[-MAX_POSTS_PER_RUN:]:
        ok = process(cfg, post, args.dry_run)
        log.info("새 글 %s: %s", "전송" if ok else "전송 실패", post.title)
        if not ok:
            return 1  # 미전송 글은 '읽음' 처리하지 않음 → 다음 주기 재시도
        if not args.dry_run:
            seen.append(post.log_no)
            save_seen(seen)
    if not args.dry_run:
        # 한 번에 너무 많이 밀린 나머지 글은 건너뜀(폭탄 방지)
        save_seen(seen + [p.log_no for p in new_posts if p.log_no not in seen])
    return 0


def setup_logging() -> None:
    LOG_DIR.mkdir(exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%Y-%m-%d %H:%M:%S")
    fh = logging.FileHandler(LOG_DIR / "bot.log", encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    log.setLevel(logging.INFO)
    log.addHandler(fh)
    log.addHandler(sh)


def main() -> int:
    p = argparse.ArgumentParser(description="메르 블로그 새 글 텔레그램 알림")
    p.add_argument("--init", action="store_true", help="현재 글 전부 읽음 처리")
    p.add_argument("--test", action="store_true", help="최신 글 1개 강제 요약·전송")
    p.add_argument("--dry-run", action="store_true", help="전송·저장 없이 출력만")
    setup_logging()
    return run(p.parse_args())


if __name__ == "__main__":
    sys.exit(main())
