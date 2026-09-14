import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getPlatform } from "@/platform";
import { appDialogs } from "@/lib/appDialogs.svelte";

export async function checkForUpdates(options?: { silent?: boolean }): Promise<void> {
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
        const progressDialog = appDialogs.progress("Downloading Update", "Preparing download...");
        
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength || 0;
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              if (contentLength > 0) {
                const percent = Math.min(downloaded / contentLength, 1);
                const mbDownloaded = (downloaded / 1024 / 1024).toFixed(1);
                const mbTotal = (contentLength / 1024 / 1024).toFixed(1);
                progressDialog.update(`Downloading... ${mbDownloaded} MB / ${mbTotal} MB`, percent);
              } else {
                progressDialog.update(`Downloading... ${(downloaded / 1024 / 1024).toFixed(1)} MB`, 0);
              }
              break;
            case 'Finished':
              progressDialog.update("Download complete. Installing...", 1);
              break;
          }
        });
        
        progressDialog.close();

        const restart = await platform.ask(
          "Update installed successfully. Do you want to restart OpenWord now?",
          { title: "Update Complete", kind: "info" }
        );
        if (restart) {
          await relaunch();
        }
      }
    } else if (!options?.silent) {
      await platform.message("You are running the latest version of OpenWord.", { title: "No Update Available" });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await platform.message(`Failed to check for updates: ${detail}`, { title: "Update Error", kind: "error" });
  }
}
