/**
 * Common types for Twitter plugin API responses
 */

import type { Tweet } from "./tweets";
import type { Profile } from "./profile";

/**
 * Pagination mode indicator for Twitter API responses.
 * - 'v2': Cursor is a v2 pagination token (opaque string)
 * - 'v1': Cursor is a tweet ID string (numeric, for max_id parameter)
 */
export type PaginationMode = 'v2' | 'v1';

/**
 * Pagination state that tracks which API version provided the cursor.
 * This prevents mixing v2 pagination tokens with v1.1 max_id parameters.
 *
 * When v2 fails mid-pagination, the fallback restarts from the beginning
 * using v1.1 (cursor is ignored). Consumers should handle potential duplicates.
 *
 * @example Legacy string cursor (backward compatible):
 * ```typescript
 * const response = await fetchTweets(userId, 100, "7140dib...", auth);
 * // String cursors are treated as v2 pagination tokens
 * ```
 *
 * @example New struct cursor (recommended):
 * ```typescript
 * const response = await fetchTweets(userId, 100,
 *   { mode: 'v2', cursor: "7140dib..." },
 *   auth
 * );
 * // Or continue with v1:
 * const response2 = await fetchTweets(userId, 100,
 *   response.next, // { mode: 'v1', cursor: "1234567890" }
 *   auth
 * );
 * ```
 */
export interface PaginationState {
  mode: PaginationMode;
  cursor: string;
}

/**
 * Response for paginated tweets queries
 */
export interface QueryTweetsResponse {
  tweets: Tweet[];
  /**
   * Next pagination cursor. undefined means no more pages.
   * Contains mode to prevent mixing v2 tokens with v1.1 tweet IDs.
   */
  next?: PaginationState;
  previous?: string;
}

/**
 * Response for paginated profiles queries
 */
export interface QueryProfilesResponse {
  profiles: Profile[];
  next?: string;
  previous?: string;
}

/**
 * Generic API result container
 */
export type RequestApiResult<T> =
  | { success: true; value: T }
  | { success: false; err: Error };

/**
 * Options for request transformation
 */
export interface FetchTransformOptions {
  /**
   * Transforms the request options before a request is made.
   */
  request: (
    ...args: [input: RequestInfo | URL, init?: RequestInit]
  ) =>
    | [input: RequestInfo | URL, init?: RequestInit]
    | Promise<[input: RequestInfo | URL, init?: RequestInit]>;

  /**
   * Transforms the response after a request completes.
   */
  response: (response: Response) => Response | Promise<Response>;
}
