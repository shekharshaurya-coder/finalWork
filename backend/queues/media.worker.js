// queue/media.worker.js
const { Worker } = require("bullmq");
const redis = require("./redis");
const Media = require("../models/Media");
const path = require("path");
const connectDB = require("../db");

// Connect to database before processing jobs
connectDB();

new Worker(
  "media_queue",
  async (job) => {
    const { userId, filePath } = job.data;

    const filename = path.basename(filePath);

    
    await Media.create({
      ownerType: "User",          
      ownerId: userId,             

      url: "/uploads/" + filename, 
      storageKey: filename,        

      mimeType: null,
      width: null,
      height: null,
      duration: null,
      sizeBytes: null,

      processed: true,             
    });

    return { status: "saved" };
  },
  { connection: redis }
);

console.log("🚀 Media Worker Running...");
