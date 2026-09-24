import { Workbench } from "../components/workbench";
import { configuration } from "../server/config";

export const dynamic = "force-dynamic";
export default function Home() {
  let mode: "demo" | "live" | "unavailable" = "unavailable";
  try {
    const config = configuration();
    mode =
      config.mode === "demo" || (config.jupiterKey && config.rpcUrl)
        ? config.mode
        : "unavailable";
  } catch {
    /* API health explains configuration failure. */
  }
  return <Workbench mode={mode} />;
}
