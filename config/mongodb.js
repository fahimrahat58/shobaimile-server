import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;

if (!uri) {
  throw new Error("MONGODB_URI is missing");
}

if (!dbName) {
  throw new Error("DB_NAME is missing");
}

const client = new MongoClient(uri);

let db;

export async function connectDB() {
  try {
    await client.connect();

    db = client.db(dbName);

    await db.command({ ping: 1 });

    console.log(`MongoDB connected: ${dbName}`);

    return db;
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    throw error;
  }
}

export function getDB() {
  if (!db) {
    throw new Error("Database is not connected");
  }

  return db;
}
