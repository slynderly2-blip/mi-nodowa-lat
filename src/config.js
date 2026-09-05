import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

export const CONFIG = {
  PORT: process.env.PORT || 3334,
  ROOT_DIR,
  DATA_DIR: process.env.DATA_DIR || path.join(ROOT_DIR, "data"),
  PUBLIC_DIR: path.join(ROOT_DIR, "public"),
  UPLOADS_DIR: path.join(ROOT_DIR, "public", "uploads"),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "ortizuwu20",
  DAILY_BANK_INTEREST: 0.01 // 1% diario
};
