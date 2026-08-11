#!/usr/bin/env node
import { Command } from "commander";
import { TeltonikaClient } from "../teltonika/client";
import { requireE164PhoneNumber } from "../phoneNumber";
import { logDebug, setLogLevel } from "./log";

export const program = new Command();
program.name("teltonika-sms-cli").description("Local CLI for testing the Teltonika RUTOS SMS API without a running SignalK server");

program.option("-l, --log-level <level>", "log verbosity: info or debug (e.g. trace which URLs are fetched)", "info");
program.hook("preAction", () => {
  setLogLevel(program.opts().logLevel);
});

function routerOptions(cmd: Command): Command {
  return cmd
    .requiredOption("-u, --router-url <url>", 'RUTOS router base URL, e.g. "https://192.168.1.1"')
    .requiredOption("--user <username>", "a non-root RUTOS user with ACL access to the messages API - see the README, or `acl` below")
    .option("--password <password>", "RUTOS password - prefer $TELTONIKA_SMS_PASSWORD instead, so it isn't left in shell history")
    .option("--no-insecure", "reject the router's certificate instead of allowing a self-signed one (RUTOS's default)");
}

function resolvePassword(opts: { password?: string }): string {
  const password = opts.password ?? process.env.TELTONIKA_SMS_PASSWORD;
  if (!password) {
    throw new Error("no password given - pass --password or set $TELTONIKA_SMS_PASSWORD");
  }
  return password;
}

function makeClient(opts: { routerUrl: string; user: string; password?: string; insecure: boolean }): TeltonikaClient {
  logDebug(`connecting to ${opts.routerUrl} as "${opts.user}" (self-signed cert allowed: ${opts.insecure})`);
  return new TeltonikaClient({
    baseUrl: opts.routerUrl,
    username: opts.user,
    password: resolvePassword(opts),
    allowSelfSignedCert: opts.insecure,
  });
}

routerOptions(program.command("login").description("Test credentials against the router and print the session token's expiry")).action(
  async (opts) => {
    const client = makeClient(opts);
    await client.login();
    console.log(`login OK as "${opts.user}"`);
  },
);

routerOptions(program.command("modems").description('List SMS-capable modem ids from "/api/messages/storage/config"'))
  .option(
    "--refresh",
    "bypass any cache and fetch fresh from the router (this CLI process has no cache anyway, but mirrors the plugin's own flag)",
  )
  .option(
    "--raw",
    "print the router's raw JSON response instead of just the extracted modem_id list - useful to sanity-check the response shape against your firmware",
  )
  .action(async (opts) => {
    const client = makeClient(opts);
    if (opts.raw) {
      console.log(JSON.stringify(await client.getRawModemConfig(), undefined, 2));
      return;
    }
    const modemIds = await client.getModemIds({ refresh: Boolean(opts.refresh) });
    if (modemIds.length === 0) {
      console.log("no modem ids found - try `modems --raw` to inspect the router's raw response");
      return;
    }
    modemIds.forEach((id) => console.log(id));
  });

routerOptions(
  program
    .command("send")
    .description("Send a single SMS directly, bypassing SignalK entirely - for hands-on testing against real hardware"),
)
  .requiredOption("-m, --modem <modemId>", 'modem id from "modems" above, e.g. "1-1"')
  .argument("<number>", 'recipient, international format, e.g. "+447123456789"')
  .argument("<message>", "message text")
  .action(async (number: string, message: string, opts) => {
    requireE164PhoneNumber(number);
    const client = makeClient(opts);
    await client.sendSms(opts.modem, number, message);
    console.log(`sent to ${number} via modem ${opts.modem}`);
  });

program
  .command("acl")
  .description("Print the steps to grant a non-root RUTOS user SMS API access")
  .argument("<username>", "the non-root username you're granting access to")
  .action((username: string) => {
    console.log(
      [
        `1. RUTOS web UI: System -> Administration -> Users -> Add (if "${username}" doesn't exist yet).`,
        "",
        `2. On "${username}"'s Permissions tab, confirmed by testing: grant either write access to all`,
        "   pages, or specifically write access to just these two permission pages:",
        "     - Services -> Mobile Utilities -> Messages -> Send",
        "     - Services -> Mobile Utilities -> Messages -> Storage",
        "",
        "   No separate API-level ACL call is needed - it's just these two checkboxes in the UI.",
      ].join("\n"),
    );
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
