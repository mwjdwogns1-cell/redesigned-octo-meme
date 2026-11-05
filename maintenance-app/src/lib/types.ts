export type Urgency = 'urgent' | 'normal' | 'low';
export type Quarter = 'now' | 'q1' | 'q2' | 'q3' | 'q4';
export type ItemStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'held';
export type PhotoKind = 'wide' | 'close' | 'scale';

export interface FieldDef {
  key: string;
  label: string;
  type: 'select' | 'number' | 'text';
  options?: string[];
  unit?: string;
  required: boolean;
  unknown?: boolean;
}

export interface Category {
  id: string;
  name: string;
  default_urgency: Urgency;
  units: string[];
  required_fields: FieldDef[];
  active: boolean;
  sort: number;
}

export interface Store { id: string; region_id: string; name: string; active: boolean }
export interface Region { id: string; name: string }

export interface Profile {
  id: string;
  role: 'staff' | 'admin';
  store_id: string | null;
  region_id: string | null;
  name: string;
  phone: string | null;
  status: 'active' | 'inactive';
}

export interface Submission { id: string; store_id: string; year: number; status: 'draft' | 'submitted'; submitted_at: string | null }
export interface Inspection { id: string; submission_id: string; category_id: string; result: 'ok' | 'needs_repair' }

export interface Item {
  id: string;
  submission_id: string;
  store_id: string;
  category_id: string;
  area: string;
  location_detail: string;
  symptom: string;
  onset: string;
  qty: number | null;
  unit: string | null;
  qty_unknown: boolean;
  work_when: 'anytime' | 'night' | 'holiday';
  high_place: 'yes' | 'no' | 'unknown';
  extra: Record<string, string>;
  needs_survey: boolean;
  urgency: Urgency;
  quarter: Quarter;
  estimate_band: 'lt50' | '50to200' | 'gt200' | null;
  status: ItemStatus;
  reject_reason: string | null;
  reject_missing: string[];
  created_at: string;
}

export interface ItemPhoto { id: string; item_id: string; kind: PhotoKind; path: string }
