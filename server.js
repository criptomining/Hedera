import express from "express";
import helmet from "helmet";
import cors from "cors";
import dotenv from "dotenv";
import { Client } from "@hashgraph/sdk";
import compression from "compression";
import http2 from "spdy";
import fs from "fs";

// Importar optimizaciones
import { setupCluster } from "./src/utils/clustering.js";
import { monitor } from "./src/middleware/performanceMonitor.js";
import { cacheMiddleware } from "./src/middleware/caching.js";
import { setupStaticOptimization } from "./src/middleware/staticOptimization.js";
import { queryService } from "./src/services/queryService.js";

// Importar rutas
import accountRoutes from "./src/routes/accounts.js";
import transactionRoutes from "./src/routes/transactions.js";
import tokenRoutes from "./src/routes/tokens.js";
import analyticsRoutes from "./src/routes/analytics.js";

dotenv.config();

// Setup clustering para multi-core
setupCluster(() => {
  const app = express();

  // ⚡ Performance optimizations
  app.use(helmet());
  app.use(compression({ level: 6 }));
  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
      credentials: true,
      maxAge: 86400,
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // 📊 Performance monitoring
  app.use(monitor.middleware());

  // 🗂️ Rutas with caching
  app.use("/api/accounts", cacheMiddleware(300), accountRoutes);
  app.use("/api/transactions", cacheMiddleware(60), transactionRoutes);
  app.use("/api/tokens", cacheMiddleware(300), tokenRoutes);
  app.use("/api/analytics", cacheMiddleware(600), analyticsRoutes);

  // Static files optimization
  setupStaticOptimization(app);

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Performance metrics endpoint
  app.get("/api/metrics", (req, res) => {
    res.json({
      performance: monitor.getMetrics(),
      cacheStats: queryService.getStats(),
      memory: process.memoryUsage(),
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error("Error:", err);
    res.status(err.status || 500).json({
      error: err.message,
      requestId: req.id,
    });
  });

  const PORT = process.env.PORT || 3000;

  // Use HTTP/2 with SPDY if certs available
  if (
    process.env.NODE_ENV === "production" &&
    fs.existsSync("./certs/key.pem") &&
    fs.existsSync("./certs/cert.pem")
  ) {
    const options = {
      key: fs.readFileSync("./certs/key.pem"),
      cert: fs.readFileSync("./certs/cert.pem"),
    };

    http2.createSecureServer(options, app).listen(PORT, () => {
      console.log(`🚀 HTTP/2 Server running on port ${PORT}`);
      console.log(`⚡ Performance optimizations enabled`);
    });
  } else {
    app.listen(PORT, () => {
      console.log(`⚡ Server running on port ${PORT}`);
      console.log(`🚀 Performance optimizations enabled`);
      console.log(`📊 Metrics available at /api/metrics`);
    });
  }
});