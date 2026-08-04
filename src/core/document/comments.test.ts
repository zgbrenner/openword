import { describe, expect, it } from "vitest";
import { createBlankDocument } from "./factory";
import { createCommentThread, resolveComment } from "./comments";

describe("comment threads", () => {
  it("normalizes author and body text", () => {
    const thread = createCommentThread({ author: " Zack ", body: " Review this clause. " });
    expect(thread.author).toBe("Zack");
    expect(thread.body).toBe("Review this clause.");
    expect(thread.replies).toEqual([]);
  });

  it("rejects empty comments", () => {
    expect(() => createCommentThread({ body: "   " })).toThrow(/cannot be empty/i);
  });

  it("resolves and reopens a thread without mutating the source document", () => {
    const thread = createCommentThread({ body: "Check this." });
    const document = createBlankDocument();
    document.comments = [thread];

    const resolved = resolveComment(document, thread.id, true);
    const reopened = resolveComment(resolved, thread.id, false);

    expect(document.comments[0]?.resolvedAt).toBeUndefined();
    expect(resolved.comments[0]?.resolvedAt).toBeTruthy();
    expect(reopened.comments[0]?.resolvedAt).toBeUndefined();
  });
});
