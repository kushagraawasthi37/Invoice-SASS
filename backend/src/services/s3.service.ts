import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, S3_BUCKET } from '../config/s3';
import { generateSecureToken } from '../utils/helpers';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import fs from 'fs';
import path from 'path';

export const s3Service = {
  async upload(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<string> {
    if (!s3Client) {
      // Local fallback: save to disk, return full backend URL so the browser can load it
      const uploadDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const filename = key.replace(/\//g, '_');
      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, buffer);
      return `http://localhost:${env.PORT}/uploads/${filename}`;
    }

    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return `https://${S3_BUCKET}.s3.amazonaws.com/${key}`;
  },

  async getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    if (!s3Client) return `http://localhost:${env.PORT}/uploads/${key.replace(/\//g, '_')}`;

    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    return getSignedUrl(s3Client, command, { expiresIn });
  },

  async download(key: string): Promise<Buffer> {
    if (!s3Client) {
      const filePath = path.join(process.cwd(), 'uploads', key.replace(/\//g, '_'));
      return fs.readFileSync(filePath);
    }
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    const response = await s3Client.send(command);
    const stream = response.Body as Readable;
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  },

  async delete(key: string): Promise<void> {
    if (!s3Client) return;
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    } catch (err) {
      logger.warn('S3 delete failed', { key, err });
    }
  },

  generateKey(workspaceId: string, type: 'pdf' | 'logo' | 'signature' | 'template', filename?: string): string {
    const extMap: Record<string, string> = { pdf: 'pdf', logo: 'png', signature: 'png', template: 'pdf' };
    const ext = extMap[type] || 'bin';
    const name = filename || generateSecureToken(8);
    return `${workspaceId}/${type}s/${name}.${ext}`;
  },
};
