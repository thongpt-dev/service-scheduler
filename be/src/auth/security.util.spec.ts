/// <reference types="jest" />

import * as jestGlobals from "@jest/globals";
import { hashPassword, normalizeEmail, verifyPassword } from "./security.util";

jestGlobals.describe("authentication security utilities", () => {
  jestGlobals.it("normalizes email addresses consistently", () => {
    jestGlobals
      .expect(normalizeEmail("  Customer@Example.COM "))
      .toBe("customer@example.com");
  });

  jestGlobals.it(
    "stores salted scrypt hashes and verifies matching passwords",
    async () => {
      const password = "correct horse battery staple";
      const firstHash = await hashPassword(password);
      const secondHash = await hashPassword(password);

      jestGlobals
        .expect(firstHash)
        .toMatch(/^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
      jestGlobals.expect(firstHash).not.toBe(secondHash);
      await jestGlobals
        .expect(verifyPassword(password, firstHash))
        .resolves.toBe(true);
      await jestGlobals
        .expect(verifyPassword("incorrect password", firstHash))
        .resolves.toBe(false);
    },
  );

  jestGlobals.it.each([
    "",
    "salt:digest",
    "scrypt$1$8$1$00112233445566778899aabbccddeeff$abcd",
    "scrypt$16384$8$1$malformed$malformed",
  ])("rejects malformed password hash %p", async (hash: string) => {
    await jestGlobals
      .expect(verifyPassword("some password", hash))
      .resolves.toBe(false);
  });
});
