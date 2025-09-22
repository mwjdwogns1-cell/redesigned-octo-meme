/* === script.js === */

// --- DOM 요소 가져오기 ---
// 버튼, 입력창, 비디오가 표시될 메인 그리드 영역을 미리 찾아둡니다.
const addVideoButton = document.getElementById('add-video-btn');
const youtubeUrlInput = document.getElementById('youtube-url');
const categorySelect = document.getElementById('category-select');
const videoGrid = document.querySelector('.video-grid');

// --- 함수: 새로운 비디오 카드를 생성하고 화면에 추가하는 함수 ---
function addVideoCard(youtubeUrl, category) {
    // 1. 유튜브 URL에서 비디오 ID 추출하기 (가장 중요한 부분)
    // 예: "https://www.youtube.com/watch?v=ABCDEFG123" -> "ABCDEFG123"
    let videoId;
    try {
        const url = new URL(youtubeUrl);
        if (url.hostname === 'youtu.be') {
            videoId = url.pathname.slice(1);
        } else {
            videoId = url.searchParams.get('v');
        }
        if (!videoId) throw new Error(); // videoId가 없으면 에러 발생
    } catch (error) {
        alert('올바른 유튜브 URL 형식이 아닙니다.');
        return; // 함수 종료
    }

    // 2. 유튜브 썸네일 이미지 URL 만들기
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    // 3. 새로운 비디오 카드의 HTML 구조를 문자열로 정의
    //    데이터를 넣을 부분은 ${} 변수 형태로 만듭니다.
    const newCardHTML = `
        <div class="video-card">
            <div class="card-inner-wrapper">
                <img src="${thumbnailUrl}" alt="비디오 썸네일">
                <div class="card-content">
                    <h3>새로 추가된 영상입니다 (제목)</h3>
                    <p class="subtitle">${category}</p>
                    <div class="tags">
                        <span>#${category}</span>
                        <span>#새로운영상</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 4. 정의한 HTML 문자열을 실제 HTML 요소로 변환하여 그리드에 추가
    videoGrid.insertAdjacentHTML('beforeend', newCardHTML);
}

// --- 이벤트 리스너: '비디오 추가' 버튼 클릭 시 동작 ---
addVideoButton.addEventListener('click', function() {
    // 입력된 값 가져오기
    const urlValue = youtubeUrlInput.value;
    const categoryValue = categorySelect.value;

    // 입력값 유효성 검사
    if (urlValue === '') {
        alert('YouTube URL을 입력해주세요!');
        return;
    }
    if (categoryValue === '카테고리 선택') {
        alert('카테고리를 선택해주세요!');
        return;
    }
    
    // 비디오 카드 추가 함수 호출
    addVideoCard(urlValue, categoryValue);

    // 입력창 초기화
    youtubeUrlInput.value = '';
    categorySelect.selectedIndex = 0;
});

// --- 초기 데이터 추가 (예시) ---
// 페이지가 처음 로드될 때 기본적으로 보여줄 비디오들을 추가합니다.
// 실제 서비스에서는 이 데이터를 서버에서 가져오게 됩니다.
document.addEventListener('DOMContentLoaded', () => {
    addVideoCard('https://www.youtube.com/watch?v=QW4UIYmC4gA', '전문분석');
    addVideoCard('https://www.youtube.com/watch?v=d_M_O39gG4g', '소모품분석');
    addVideoCard('https://www.youtube.com/watch?v=INscvD-I5ws', '생기부케어');
    addVideoCard('https://www.youtube.com/watch?v=U_G-5g46M-E', '재수');
});