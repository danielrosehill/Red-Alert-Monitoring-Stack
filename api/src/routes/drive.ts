import { Router } from "express";
import { uploadToDrive } from "../lib/drive.js";

export const driveRouter = Router();

driveRouter.post("/upload", async (req, res) => {
  const { filePath, fileName } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: "filePath required" });
  }
  const result = await uploadToDrive(filePath, fileName);
  res.json(result);
});

driveRouter.get("/status", (_req, res) => {
  const configured = !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
  );
  res.json({ configured });
});
