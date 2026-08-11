import { Plugin, ServerAPI } from "@signalk/server-api";
import { createPlugin } from "./plugin";

function plugin(app: ServerAPI): Plugin {
  return createPlugin(app);
}

export = plugin;
