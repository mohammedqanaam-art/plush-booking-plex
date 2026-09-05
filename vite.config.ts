import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), {
    name: "private-data-client-boundary",
    apply: "build",
    generateBundle(_options, bundle) {
      // A login screen cannot protect data embedded in downloadable JS chunks.
      const privateData = /\/src\/data\/(?:hotels\.|hotelMasterData\.|sheetOperationalData\.|knowledge\/|knowledge_bank_seed\.|branches\.|operations\.|branchDataReview\.)/;
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk") continue;
        if (Object.keys(item.modules).some((id) => privateData.test(id.replaceAll("\\", "/")))) {
          this.error(`Operational data leaked into client chunk: ${item.fileName}`);
        }
      }
    },
  }],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
