import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("pmo_data.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    data TEXT,
    mime_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS analysis_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '100mb' }));

  // API Routes
  app.get("/api/data", (req, res) => {
    const uploads = db.prepare("SELECT * FROM uploads ORDER BY created_at DESC").all();
    const latestAnalysis = db.prepare("SELECT * FROM analysis_results ORDER BY created_at DESC LIMIT 1").get();
    res.json({ uploads, latestAnalysis: latestAnalysis ? JSON.parse(latestAnalysis.data) : null });
  });

  app.post("/api/upload", (req, res) => {
    const { files } = req.body;
    const insert = db.prepare("INSERT INTO uploads (name, data, mime_type) VALUES (?, ?, ?)");
    
    const transaction = db.transaction((files) => {
      for (const file of files) {
        insert.run(file.name, file.data, file.mimeType);
      }
    });
    
    transaction(files);
    res.json({ success: true });
  });

  app.post("/api/analysis", (req, res) => {
    const { data } = req.body;
    db.prepare("INSERT INTO analysis_results (data) VALUES (?)").run(JSON.stringify(data));
    res.json({ success: true });
  });

  app.delete("/api/data", (req, res) => {
    db.prepare("DELETE FROM uploads").run();
    db.prepare("DELETE FROM analysis_results").run();
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
