export type ApiSuccess<T> = {
  ok: true;
  requestId: string;
  data: T;
};

export type ApiError = {
  ok: false;
  requestId: string;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export function success<T>(requestId: string, data: T): ApiSuccess<T> {
  return {
    ok: true,
    requestId,
    data,
  };
}

export function failure(
  requestId: string,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return {
    ok: false,
    requestId,
    error: {
      code,
      message,
      details,
    },
  };
}