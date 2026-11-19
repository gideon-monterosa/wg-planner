import { ApiError } from "./api.ts";

/** The message for a failed idea mutation, by the error codes the ideas API returns. */
export function ideaErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "not_creator":
        return "Only the person who added this idea can move it.";
      case "read_only":
        return "You can't edit that item.";
      case "not_found":
        return "That idea or item no longer exists.";
      case "invalid_body":
        return "Check the link (http or https) and the price.";
    }
  }
  return "Something went wrong. Try again.";
}
