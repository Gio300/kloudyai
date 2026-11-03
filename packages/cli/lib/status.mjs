import { readCard } from "./card.mjs";
import { readPolicy } from "./policy.mjs";
import { readDirectory } from "./directory.mjs";
import { countSessions } from "./session.mjs";

export function localStatus(api, cwd = process.cwd()) {
  return {
    mode: api ? "online" : "local",
    card: readCard(cwd),
    policy: readPolicy(),
    directory: readDirectory().length,
    sessions: countSessions(),
  };
}
