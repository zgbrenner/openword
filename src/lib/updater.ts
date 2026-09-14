import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getPlatform } from "@/platform";

export async function checkForUpdates(): Promise<void> {
  const platform = getPlatform();
  if (platform.kind !== "desktop") {
    await platform.message("Updates are managed through your browser for the web version.", { title: "OpenWord" });
    return;
  }

  try {
    const update = await check();
    if (update) {
      const wantUpdate = await platform.ask(
        `Version ${update.version} is available. Would you like to download and install it now?\n\nRelease notes:\n${update.body || "No release notes provided."}`,
        { title: "Update Available", kind: "info" }
      );

      if (wantUpdate) {
        let downloaded = 0;
        let contentLength = 0;
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength || 0;
              console.log(`started downloading ${event.data.contentLength} bytes`);
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              console.log(`downloaded ${downloaded} from ${contentLength}`);
              break;
            case 'Finished':
              console.log('download finished');
              break;
          }
        });
        
        const restart = await platform.ask(
          "Update installed successfully. Do you want to restart OpenWord now?",
          { title: "Update Complete", kind: "info" }
        );
        if (restart) {
          await relaunch();
        }
      }
    } else {
      await platform.message("You are running the latest version of OpenWord.", { title: "No Update Available" });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await platform.message(`Failed to check for updates: ${detail}`, { title: "Update Error", kind: "error" });
  }
}
