export interface SuccessResponse<T = unknown> {
  status: boolean;
  message: string;
  data?: T;
  timestamp?: string;
  request_id?: string;
  count?: number;
  page?: number;
  size?: number;
  total_pages?: number;
}

export interface ErrorResponse {
  status: boolean;
  message: string;
  data?: unknown;
}
