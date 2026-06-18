import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "./store";

// Reset to the *initial* idle state (clear() would flip to "unauthenticated").
beforeEach(() =>
  useAuthStore.setState({ user: null, accessToken: null, status: "idle" }),
);

describe("auth store", () => {
  it("starts idle with no user/token", () => {
    const s = useAuthStore.getState();
    expect(s.status).toBe("idle");
    expect(s.user).toBeNull();
    expect(s.accessToken).toBeNull();
  });

  it("setAuth populates user+token and flips to authenticated", () => {
    useAuthStore.getState().setAuth({ id: "u", email: "a@b.test" } as never, "tok");
    const s = useAuthStore.getState();
    expect(s.status).toBe("authenticated");
    expect(s.accessToken).toBe("tok");
    expect(s.user?.email).toBe("a@b.test");
  });

  it("clear resets to unauthenticated with no credentials", () => {
    useAuthStore.getState().setAuth({ id: "u" } as never, "tok");
    useAuthStore.getState().clear();
    const s = useAuthStore.getState();
    expect(s.status).toBe("unauthenticated");
    expect(s.accessToken).toBeNull();
  });
});
