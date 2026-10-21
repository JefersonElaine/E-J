import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config.js";

function localPath(key) {
  return path.join(config.dataDir, "uploads", key);
}

class LocalStorage {
  async put(key, buffer, mime) {
    const dest = localPath(key);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, buffer);
    return { key, mime };
  }

  async remove(key) {
    const dest = localPath(key);
    try {
      await fs.promises.unlink(dest);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async exists(key) {
    try {
      await fs.promises.access(localPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async stream(key) {
    const dest = localPath(key);
    const stat = await fs.promises.stat(dest);
    return { stream: fs.createReadStream(dest), size: stat.size };
  }

  async usageBytes() {
    const root = path.join(config.dataDir, "uploads");
    let total = 0;
    async function walk(dir) {
      let entries = [];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else {
          const st = await fs.promises.stat(full);
          total += st.size;
        }
      }
    }
    await walk(root);
    return total;
  }
}

class S3Storage {
  constructor() {
    this.client = new S3Client({
      region: config.s3.region || "auto",
      endpoint: config.s3.endpoint || undefined,
      forcePathStyle: config.s3.forcePathStyle,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    });
    this.bucket = config.s3.bucket;
  }

  async put(key, buffer, mime) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mime,
      })
    );
    return { key, mime };
  }

  async remove(key) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async stream(key) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const stream = res.Body instanceof Readable ? res.Body : Readable.fromWeb(res.Body);
    return { stream, size: Number(res.ContentLength || 0) };
  }

  async signedGetUrl(key, seconds) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: seconds }
    );
  }

  async usageBytes() {
    return 0;
  }
}

export function createStorage() {
  if (config.storageDriver === "s3") {
    if (!config.s3.bucket || !config.s3.accessKeyId || !config.s3.secretAccessKey) {
      throw new Error("STORAGE_DRIVER=s3 exige S3_BUCKET, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY.");
    }
    return new S3Storage();
  }
  return new LocalStorage();
}
