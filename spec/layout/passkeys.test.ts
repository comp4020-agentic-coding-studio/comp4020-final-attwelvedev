import type { Browser, BrowserContext, CDPSession, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { axeViolations, DESKTOP, horizontalOverflow, launch, PHONE } from "../browser.ts";
import { addItem, row, startHousehold } from "../people.ts";

// WebAuthn only works on a secure context: http://localhost counts, a bare IP
// address does not, so these checks need APP_URL to name localhost.
const baseUrl = inject("baseUrl");
const url = (path: string) => new URL(path, baseUrl).href;

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

interface Authenticator {
  cdp: CDPSession;
  id: string;
}

// Chrome's virtual authenticator: a platform passkey that holds discoverable
// credentials, verifies the user and says yes without being asked.
async function authenticatorFor(context: BrowserContext, page: Page): Promise<Authenticator> {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, id: authenticatorId };
}

async function credentialsOf({ cdp, id }: Authenticator) {
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId: id });
  return credentials;
}

async function registerPasskey(page: Page): Promise<void> {
  await page.goto(url("/household"));
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await page.getByRole("list", { name: "Your passkeys" }).waitFor();
  await page.getByRole("button", { name: "Remove passkey" }).waitFor();
}

const signedOutNote = /didn't work/i;
async function trySignin(page: Page): Promise<void> {
  await page.goto(url("/passkey/signin"));
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
}

const hasDeviceCookie = async (context: BrowserContext) =>
  (await context.cookies()).some((c) => c.name === "pantry_device");

describe("passkeys in a browser", () => {
  it("signs in as the same member after the cookies are gone", async () => {
    const sam = await startHousehold(browser, baseUrl, { name: "Sam" });
    await authenticatorFor(sam.context, sam.page);
    await addItem(sam.page, "Milk");
    await row(sam.page, "Milk").waitFor();
    await registerPasskey(sam.page);
    expect(
      await sam.page.getByRole("list", { name: "Your passkeys" }).getByRole("listitem").count(),
    ).toBe(1);

    await sam.context.clearCookies();
    await sam.page.goto(url("/"));
    await sam.page.getByLabel("Household name").waitFor();
    await sam.page.getByRole("link", { name: "Sign in with a passkey" }).click();
    await sam.page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await sam.page.waitForURL(url("/"));
    await sam.page.getByRole("heading", { name: "Unit 4" }).waitFor();
    await row(sam.page, "Milk").waitFor();

    await sam.page.goto(url("/household"));
    const members = sam.page.locator('section[aria-labelledby="members-heading"] li');
    await members.first().waitFor();
    expect(await members.count()).toBe(1);
    expect(await members.first().innerText()).toContain("Sam");
    await sam.context.close();
  }, 30_000);

  it("rejects a credential the server doesn't know", async () => {
    const sam = await startHousehold(browser, baseUrl, { name: "Sam" });
    const key = await authenticatorFor(sam.context, sam.page);
    await registerPasskey(sam.page);
    await key.cdp.send("WebAuthn.clearCredentials", { authenticatorId: key.id });
    await sam.context.clearCookies();

    await trySignin(sam.page);
    await sam.page.getByRole("status").filter({ hasText: signedOutNote }).waitFor();
    expect(await hasDeviceCookie(sam.context)).toBe(false);
    await sam.page.goto(url("/"));
    await sam.page.getByLabel("Household name").waitFor();
    await sam.context.close();
  }, 30_000);

  it("stops accepting a passkey once it is removed, wherever it is held", async () => {
    const sam = await startHousehold(browser, baseUrl, { name: "Sam" });
    const first = await authenticatorFor(sam.context, sam.page);
    await registerPasskey(sam.page);
    const [credential] = await credentialsOf(first);

    await sam.page.getByRole("button", { name: "Remove passkey" }).click();
    await sam.page.waitForURL(url("/household"));
    expect(await sam.page.getByRole("button", { name: "Remove passkey" }).count()).toBe(0);

    // a second authenticator that still holds the removed credential
    const elsewhere = await sam.context.newPage();
    const second = await authenticatorFor(sam.context, elsewhere);
    await second.cdp.send("WebAuthn.addCredential", {
      authenticatorId: second.id,
      credential,
    });
    await sam.context.clearCookies();
    await trySignin(elsewhere);
    await elsewhere.getByRole("status").filter({ hasText: signedOutNote }).waitFor();
    expect(await hasDeviceCookie(sam.context)).toBe(false);
    await sam.context.close();
  }, 30_000);

  it("gives each sign-in its own session and leaves the others signed in", async () => {
    const sam = await startHousehold(browser, baseUrl, { name: "Sam" });
    const key = await authenticatorFor(sam.context, sam.page);
    await registerPasskey(sam.page);
    const [credential] = await credentialsOf(key);

    const signedIn: Page[] = [sam.page];
    const contexts: BrowserContext[] = [];
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ viewport: DESKTOP });
      contexts.push(context);
      const page = await context.newPage();
      const device = await authenticatorFor(context, page);
      // A real second device holds its own counter. The server refuses a counter
      // that doesn't go up (a cloned credential), so each copy starts higher.
      await device.cdp.send("WebAuthn.addCredential", {
        authenticatorId: device.id,
        credential: { ...credential, signCount: 100 * (i + 1) },
      });
      await trySignin(page);
      await page.waitForURL(url("/"));
      signedIn.push(page);
    }
    for (const page of signedIn) {
      await page.goto(url("/"));
      await page.getByRole("heading", { name: "Unit 4" }).waitFor();
    }
    for (const context of [sam.context, ...contexts]) await context.close();
  }, 30_000);

  it("says so, and shows no button, where WebAuthn doesn't exist", async () => {
    const sam = await startHousehold(browser, baseUrl, { name: "Sam" });
    const errors: string[] = [];
    await sam.context.addInitScript(() => {
      // biome-ignore lint/suspicious/noExplicitAny: removing a browser global
      delete (window as any).PublicKeyCredential;
    });
    sam.page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    sam.page.on("pageerror", (e) => errors.push(String(e)));
    await sam.page.goto(url("/household"));
    await sam.page.getByText("This browser can't use passkeys.").waitFor();
    expect(await sam.page.getByRole("button", { name: "Add a passkey" }).count()).toBe(0);
    expect(errors).toEqual([]);
    await sam.context.close();
  }, 30_000);

  for (const [label, viewport] of [
    ["PHONE", PHONE],
    ["DESKTOP", DESKTOP],
  ] as const) {
    it(`fits at ${label}, with a passkey listed and on the sign-in page`, async () => {
      const sam = await startHousehold(browser, baseUrl, { name: "Sam", viewport });
      await authenticatorFor(sam.context, sam.page);
      await registerPasskey(sam.page);
      expect(await horizontalOverflow(sam.page)).toBeLessThanOrEqual(0);
      expect(await axeViolations(sam.page)).toEqual([]);

      await sam.context.clearCookies();
      await sam.page.goto(url("/passkey/signin"));
      await sam.page.getByRole("button", { name: "Sign in with a passkey" }).waitFor();
      expect(await horizontalOverflow(sam.page)).toBeLessThanOrEqual(0);
      expect(await axeViolations(sam.page)).toEqual([]);
      await sam.context.close();
    }, 30_000);
  }
});
