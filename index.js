import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import { connectDB, getDB } from "./config/mongodb.js";
import { verifyToken } from "./middleware/verifyToken.js";
import { ObjectId } from "mongodb";
import PDFDocument from "pdfkit";
import { randomUUID } from "node:crypto";

const app = express();
const PORT = process.env.PORT || 5000;

// ================= MIDDLEWARE =================

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }),
);

app.use(express.json());

// ================= GLOBAL DEBUG LOGGER =================

app.use((req, res, next) => {
  console.log("\n========================================");
  console.log("🌐 INCOMING REQUEST");
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("Time:", new Date().toLocaleString("en-BD"));
  console.log(
    "Authorization:",
    req.headers.authorization ? "✅ Bearer token present" : "❌ No token",
  );

  if (Object.keys(req.body || {}).length > 0) {
    console.log("Request Body:", req.body);
  }

  res.on("finish", () => {
    console.log("Response Status:", res.statusCode);
    console.log("Completed:", req.method, req.originalUrl);
    console.log("========================================\n");
  });

  next();
});

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
  }),
);

// ================= CONSTANTS =================

const allowedCategories = [
  "Cleanup",
  "Plantation",
  "Donation",
  "Education",
  "Food Support",
  "Animal Welfare",
  "Other",
];

const getTodayBD = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const normalizeEmail = (email) => email?.trim().toLowerCase();

// ================= VALIDATION =================

const validateEventData = (data) => {
  const {
    title,
    description,
    category,
    image,
    location,
    eventDate,
    volunteerGuidelines,
  } = data;

  if (
    typeof title !== "string" ||
    typeof description !== "string" ||
    typeof category !== "string" ||
    typeof image !== "string" ||
    typeof location !== "string" ||
    typeof eventDate !== "string"
  ) {
    return "Invalid event information.";
  }

  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  const cleanCategory = category.trim();
  const cleanImage = image.trim();
  const cleanLocation = location.trim();

  if (cleanTitle.length < 3 || cleanTitle.length > 100) {
    return "Title must be between 3 and 100 characters.";
  }

  if (cleanDescription.length < 10 || cleanDescription.length > 2000) {
    return "Description must be between 10 and 2000 characters.";
  }

  if (!allowedCategories.includes(cleanCategory)) {
    return "Invalid event category.";
  }

  try {
    const imageURL = new URL(cleanImage);

    if (
      !["http:", "https:"].includes(imageURL.protocol) ||
      !imageURL.hostname.includes(".")
    ) {
      return "Invalid image URL.";
    }
  } catch {
    return "Please provide a valid image URL.";
  }

  if (cleanLocation.length < 3 || cleanLocation.length > 200) {
    return "Location must be between 3 and 200 characters.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return "Invalid event date format.";
  }

  const parsedDate = new Date(`${eventDate}T00:00:00.000Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== eventDate
  ) {
    return "Invalid event date.";
  }

  if (eventDate <= getTodayBD()) {
    return "Event date must be in the future.";
  }

  if (
    !Array.isArray(volunteerGuidelines) ||
    volunteerGuidelines.length < 1 ||
    volunteerGuidelines.length > 10
  ) {
    return "Add between 1 and 10 volunteer guidelines.";
  }

  const validGuidelines = volunteerGuidelines.every(
    (item) =>
      typeof item === "string" &&
      item.trim().length >= 3 &&
      item.trim().length <= 200,
  );

  if (!validGuidelines) {
    return "Each guideline must be between 3 and 200 characters.";
  }

  return null;
};

const prepareEventData = (data) => ({
  title: data.title.trim(),
  description: data.description.trim(),
  category: data.category.trim(),
  image: data.image.trim(),
  location: data.location.trim(),
  eventDate: new Date(`${data.eventDate}T00:00:00.000Z`),
  volunteerGuidelines: data.volunteerGuidelines.map((item) => item.trim()),
});

// ================= HEALTH CHECK =================

app.get("/", (req, res) => {
  console.log("🏠 HEALTH CHECK API HIT");

  return res.status(200).json({
    success: true,
    message: "ShobaiMile API is running!",
  });
});

// ================= PROTECTED TEST =================

app.get("/api/protected", verifyToken, (req, res) => {
  console.log("🔐 PROTECTED ROUTE HIT");
  console.log("Authenticated User:", req.user.email);

  return res.status(200).json({
    success: true,
    message: "You are authenticated!",
    user: req.user,
  });
});

// ================= UPCOMING EVENTS =================

app.get("/api/events/upcoming", async (req, res) => {
  console.log("📅 UPCOMING EVENTS API HIT");

  try {
    const db = getDB();

    const events = await db
      .collection("events")
      .find({ eventDate: { $gte: new Date() } })
      .sort({ eventDate: 1 })
      .limit(6)
      .toArray();

    console.log("✅ Upcoming Events Found:", events.length);

    return res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("❌ Upcoming events error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load upcoming events",
    });
  }
});

// ================= CREATE EVENT =================

app.post("/api/events", verifyToken, async (req, res) => {
  console.log("➕ CREATE EVENT API HIT");

  try {
    const creatorEmail = normalizeEmail(req.user.email);

    console.log("Logged-in User:", creatorEmail);

    if (!creatorEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const validationError = validateEventData(req.body);

    if (validationError) {
      console.log("❌ Validation Error:", validationError);

      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const newEvent = {
      ...prepareEventData(req.body),
      creatorEmail,
      createdAt: new Date(),
    };

    const db = getDB();

    console.log("🔄 Inserting event into MongoDB...");

    const result = await db.collection("events").insertOne(newEvent);

    console.log("✅ Event Created:", result.insertedId);

    return res.status(201).json({
      success: true,
      message: "Event created successfully",
      event: {
        _id: result.insertedId,
        ...newEvent,
      },
    });
  } catch (error) {
    console.error("❌ Create event error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create event",
    });
  }
});

// ================= MY EVENTS =================

app.get("/api/events/my-events", verifyToken, async (req, res) => {
  console.log("📌 MY EVENTS API HIT");

  try {
    const creatorEmail = normalizeEmail(req.user.email);

    if (!creatorEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const db = getDB();

    const events = await db
      .collection("events")
      .find({ creatorEmail })
      .sort({ createdAt: -1 })
      .toArray();

    console.log("✅ Events Found:", events.length);

    return res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("❌ My events error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load your events",
    });
  }
});

// ================= UPDATE EVENT =================

app.patch("/api/events/:id", verifyToken, async (req, res) => {
  console.log("✏️ UPDATE EVENT API HIT");

  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    const validationError = validateEventData(req.body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const creatorEmail = normalizeEmail(req.user.email);

    if (!creatorEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const db = getDB();

    const result = await db.collection("events").updateOne(
      {
        _id: new ObjectId(id),
        creatorEmail,
      },
      {
        $set: {
          ...prepareEventData(req.body),
          updatedAt: new Date(),
        },
      },
    );

    console.log("Matched:", result.matchedCount);
    console.log("Modified:", result.modifiedCount);

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you are not the owner",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Event updated successfully",
    });
  } catch (error) {
    console.error("❌ Update event error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update event",
    });
  }
});

// ================= DELETE EVENT =================

app.delete("/api/events/:id", verifyToken, async (req, res) => {
  console.log("🗑️ DELETE EVENT API HIT");

  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    const creatorEmail = normalizeEmail(req.user.email);

    if (!creatorEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const db = getDB();

    const result = await db.collection("events").deleteOne({
      _id: new ObjectId(id),
      creatorEmail,
    });

    console.log("Deleted Count:", result.deletedCount);

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you are not the owner",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("❌ Delete event error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete event",
    });
  }
});

// ================= JOIN EVENT =================

app.post("/api/events/:id/join", verifyToken, async (req, res) => {
  console.log("🤝 JOIN EVENT API HIT");

  try {
    const { id } = req.params;
    const userEmail = normalizeEmail(req.user.email);

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const db = getDB();
    const eventId = new ObjectId(id);

    const event = await db.collection("events").findOne({
      _id: eventId,
      eventDate: { $gte: new Date() },
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Upcoming event not found",
      });
    }

    const existingJoin = await db.collection("eventParticipants").findOne({
      eventId,
      userEmail,
    });

    if (existingJoin) {
      return res.status(409).json({
        success: false,
        message: "You have already joined this event",
      });
    }

    await db.collection("eventParticipants").insertOne({
      eventId,
      userEmail,
      joinedAt: new Date(),
    });

    console.log("✅ User joined event successfully");

    return res.status(201).json({
      success: true,
      message: "You joined the event successfully",
    });
  } catch (error) {
    console.error("❌ Join event error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already joined this event",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to join event",
    });
  }
});

// ================= EVENT PARTICIPANTS =================

app.get("/api/events/:id/participants", verifyToken, async (req, res) => {
  console.log("👥 PARTICIPANTS API HIT");

  try {
    const { id } = req.params;
    const organizerEmail = normalizeEmail(req.user.email);

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    if (!organizerEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const db = getDB();
    const eventId = new ObjectId(id);

    const event = await db.collection("events").findOne({
      _id: eventId,
      creatorEmail: organizerEmail,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you are not the organizer",
      });
    }

    const joinedParticipants = await db
      .collection("eventParticipants")
      .find({ eventId })
      .toArray();

    const participants = await Promise.all(
      joinedParticipants.map(async (participant) => {
        const participantEmail = normalizeEmail(participant.userEmail);

        const volunteer = await db
          .collection("user")
          .findOne(
            { email: participantEmail },
            { projection: { name: 1, email: 1, image: 1 } },
          );

        const record = await db.collection("volunteerRecords").findOne({
          eventId,
          userEmail: participantEmail,
        });

        return {
          email: participantEmail,
          name: volunteer?.name || "Unknown Volunteer",
          image: volunteer?.image || "",
          joinedAt: participant.joinedAt,
          verified: Boolean(record),
          volunteerHours: record?.volunteerHours || 0,
          totalPoints: record?.totalPoints || 0,
        };
      }),
    );

    console.log("Participants Found:", participants.length);

    return res.status(200).json({
      success: true,
      eventTitle: event.title,
      participants,
    });
  } catch (error) {
    console.error("❌ Participants error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load participants",
    });
  }
});

// ================= JOINED EVENTS =================

app.get("/api/events/joined", verifyToken, async (req, res) => {
  console.log("📚 JOINED EVENTS API HIT");

  try {
    const userEmail = normalizeEmail(req.user.email);

    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const db = getDB();

    const joinedEvents = await db
      .collection("eventParticipants")
      .aggregate([
        { $match: { userEmail } },
        {
          $lookup: {
            from: "events",
            localField: "eventId",
            foreignField: "_id",
            as: "event",
          },
        },
        { $unwind: "$event" },
        { $sort: { "event.eventDate": 1 } },
        {
          $project: {
            _id: 1,
            joinedAt: 1,
            event: 1,
          },
        },
      ])
      .toArray();

    console.log("Joined Events Found:", joinedEvents.length);

    return res.status(200).json({
      success: true,
      count: joinedEvents.length,
      events: joinedEvents,
    });
  } catch (error) {
    console.error("❌ Joined events error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load joined events",
    });
  }
});

// ================= VERIFY PARTICIPANT =================

app.post(
  "/api/events/:id/verify-participant",
  verifyToken,
  async (req, res) => {
    console.log("✅ VERIFY PARTICIPANT API HIT");

    try {
      const { id } = req.params;
      const organizerEmail = normalizeEmail(req.user.email);
      const { userEmail, volunteerHours } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid event ID",
        });
      }

      const participantEmail = normalizeEmail(userEmail);
      const hours = Number(volunteerHours);

      if (!organizerEmail || !participantEmail) {
        return res.status(400).json({
          success: false,
          message: "User email is required",
        });
      }

      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        return res.status(400).json({
          success: false,
          message: "Volunteer hours must be between 0 and 24",
        });
      }

      const db = getDB();
      const eventId = new ObjectId(id);

      const event = await db.collection("events").findOne({
        _id: eventId,
        creatorEmail: organizerEmail,
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found or you are not the organizer",
        });
      }

      if (new Date(event.eventDate) > new Date()) {
        return res.status(400).json({
          success: false,
          message: "You can verify participants after the event ends",
        });
      }

      const participant = await db.collection("eventParticipants").findOne({
        eventId,
        userEmail: participantEmail,
      });

      if (!participant) {
        return res.status(404).json({
          success: false,
          message: "Participant has not joined this event",
        });
      }

      const existingRecord = await db.collection("volunteerRecords").findOne({
        eventId,
        userEmail: participantEmail,
      });

      if (existingRecord) {
        return res.status(409).json({
          success: false,
          message: "Participant has already been verified",
        });
      }

      const volunteer = await db
        .collection("user")
        .findOne(
          { email: participantEmail },
          { projection: { name: 1, email: 1 } },
        );

      const volunteerName = volunteer?.name || "Volunteer";

      // Points calculation
      const participationPoints = 10;
      const hourPoints = Math.round(hours * 10);
      const bonusPoints = 5;
      const totalPoints = participationPoints + hourPoints + bonusPoints;

      const certificateId = randomUUID();

      const volunteerRecord = {
        eventId,
        eventTitle: event.title,
        userEmail: participantEmail,
        volunteerName,
        volunteerHours: hours,
        participationPoints,
        hourPoints,
        bonusPoints,
        totalPoints,
        verifiedBy: organizerEmail,
        verifiedAt: new Date(),
        certificateId,
      };

      await db.collection("volunteerRecords").insertOne(volunteerRecord);

      await db.collection("certificates").insertOne({
        certificateId,
        eventId,
        eventTitle: event.title,
        eventDate: event.eventDate,
        userEmail: participantEmail,
        volunteerName,
        volunteerHours: hours,
        issuedAt: new Date(),
      });

      console.log("✅ Participant verified:", participantEmail);
      console.log("Total Points:", totalPoints);
      console.log("Certificate ID:", certificateId);

      return res.status(200).json({
        success: true,
        message: "Participant verified successfully",
        record: volunteerRecord,
        certificateId,
      });
    } catch (error) {
      console.error("❌ Verify participant error:", error);

      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "Participant has already been verified",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to verify participant",
      });
    }
  },
);

// ================= MY IMPACT =================

app.get("/api/impact/me", verifyToken, async (req, res) => {
  console.log("🌱 MY IMPACT API HIT");

  try {
    const userEmail = normalizeEmail(req.user.email);

    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const db = getDB();

    const records = await db
      .collection("volunteerRecords")
      .find({ userEmail })
      .sort({ verifiedAt: -1 })
      .toArray();

    const totalHours = records.reduce(
      (sum, record) => sum + (Number(record.volunteerHours) || 0),
      0,
    );

    const totalPoints = records.reduce(
      (sum, record) => sum + (Number(record.totalPoints) || 0),
      0,
    );

    console.log("Impact Records:", records.length);
    console.log("Total Hours:", totalHours);
    console.log("Total Points:", totalPoints);

    return res.status(200).json({
      success: true,
      totalEvents: records.length,
      totalHours,
      totalPoints,
      records,
    });
  } catch (error) {
    console.error("❌ My impact error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load impact data",
    });
  }
});

// ================= IMPACT LEADERBOARD =================

app.get("/api/impact/leaderboard", verifyToken, async (req, res) => {
  console.log("🏆 LEADERBOARD API HIT");

  try {
    const db = getDB();

    const leaderboard = await db
      .collection("volunteerRecords")
      .aggregate([
        {
          $group: {
            _id: "$userEmail",
            volunteerHours: { $sum: "$volunteerHours" },
            totalPoints: { $sum: "$totalPoints" },
            totalEvents: { $sum: 1 },
          },
        },
        { $sort: { totalPoints: -1 } },
        { $limit: 100 },
        {
          $lookup: {
            from: "user",
            localField: "_id",
            foreignField: "email",
            as: "user",
          },
        },
        {
          $unwind: {
            path: "$user",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            email: "$_id",
            name: { $ifNull: ["$user.name", "Volunteer"] },
            image: { $ifNull: ["$user.image", ""] },
            volunteerHours: 1,
            totalPoints: 1,
            totalEvents: 1,
          },
        },
      ])
      .toArray();

    console.log("Leaderboard Users:", leaderboard.length);

    return res.status(200).json({
      success: true,
      leaderboard,
    });
  } catch (error) {
    console.error("❌ Leaderboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load leaderboard",
    });
  }
});

// ================= MY CERTIFICATES =================

app.get("/api/certificates/me", verifyToken, async (req, res) => {
  console.log("🎓 MY CERTIFICATES API HIT");

  try {
    const userEmail = normalizeEmail(req.user.email);

    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const db = getDB();

    const certificates = await db
      .collection("certificates")
      .find({ userEmail })
      .sort({ issuedAt: -1 })
      .toArray();

    console.log("Certificates Found:", certificates.length);

    return res.status(200).json({
      success: true,
      count: certificates.length,
      certificates,
    });
  } catch (error) {
    console.error("❌ Certificates error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load certificates",
    });
  }
});

// ================= DOWNLOAD CERTIFICATE =================

app.get("/api/certificates/:id/download", verifyToken, async (req, res) => {
  console.log("📄 DOWNLOAD CERTIFICATE API HIT");

  try {
    const { id } = req.params;
    const userEmail = normalizeEmail(req.user.email);

    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const db = getDB();

    const certificate = await db.collection("certificates").findOne({
      certificateId: id,
      userEmail,
    });

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
    }

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 50,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="certificate-${id}.pdf"`,
    );

    doc.pipe(res);

    doc.fontSize(32).text("CERTIFICATE OF PARTICIPATION", {
      align: "center",
    });

    doc.moveDown(2);

    doc.fontSize(18).text("This certificate is proudly presented to", {
      align: "center",
    });

    doc.moveDown();

    doc.fontSize(28).text(certificate.volunteerName || "Volunteer", {
      align: "center",
    });

    doc.moveDown();

    doc
      .fontSize(16)
      .text(
        `For participating in ${certificate.eventTitle || "a volunteer event"}`,
        { align: "center" },
      );

    doc.moveDown();

    doc
      .fontSize(14)
      .text(`Volunteer Hours: ${certificate.volunteerHours || 0}`, {
        align: "center",
      });

    doc.moveDown();

    doc
      .fontSize(12)
      .text(`Certificate ID: ${certificate.certificateId}`, {
        align: "center",
      });

    doc.moveDown();

    doc
      .fontSize(12)
      .text(`Issued: ${new Date(certificate.issuedAt).toLocaleDateString()}`, {
        align: "center",
      });

    doc.end();

    console.log("✅ Certificate PDF generated:", id);
  } catch (error) {
    console.error("❌ Certificate download error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to download certificate",
      });
    }
  }
});

// ================= ALL EVENTS =================

app.get("/api/events", async (req, res) => {
  console.log("📋 ALL EVENTS API HIT");

  try {
    const db = getDB();

    const events = await db
      .collection("events")
      .find({ eventDate: { $gte: new Date() } })
      .sort({ eventDate: 1 })
      .toArray();

    console.log("Events Found:", events.length);

    return res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("❌ All events error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load events",
    });
  }
});

// ================= SINGLE EVENT =================

app.get("/api/events/:id", async (req, res) => {
  console.log("🔎 SINGLE EVENT API HIT");

  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    const db = getDB();

    const event = await db.collection("events").findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const creator = await db.collection("user").findOne(
      { email: event.creatorEmail },
      {
        projection: {
          name: 1,
          email: 1,
          image: 1,
        },
      },
    );

    return res.status(200).json({
      success: true,
      event: {
        ...event,
        creator: creator || null,
      },
    });
  } catch (error) {
    console.error("❌ Single event error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load event",
    });
  }
});

// ================= MY PROFILE =================

app.get("/api/profile/me", verifyToken, async (req, res) => {
  console.log("👤 MY PROFILE API HIT");

  try {
    const userEmail = normalizeEmail(req.user.email);

    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const db = getDB();

    const user = await db.collection("user").findOne(
      { email: userEmail },
      {
        projection: {
          name: 1,
          email: 1,
          image: 1,
        },
      },
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("❌ Profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load profile",
    });
  }
});

// ================= UPDATE PROFILE =================

app.patch("/api/profile/me", verifyToken, async (req, res) => {
  console.log("✏️ UPDATE PROFILE API HIT");

  try {
    const userEmail = normalizeEmail(req.user.email);
    const { name, image } = req.body;

    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const updateData = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: "Name must contain at least 2 characters",
        });
      }

      updateData.name = name.trim();
    }

    if (image !== undefined) {
      if (typeof image !== "string") {
        return res.status(400).json({
          success: false,
          message: "Invalid image URL",
        });
      }

      try {
        const imageURL = new URL(image.trim());

        if (!["http:", "https:"].includes(imageURL.protocol)) {
          throw new Error("Invalid protocol");
        }

        updateData.image = image.trim();
      } catch {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid image URL",
        });
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No profile information provided",
      });
    }

    updateData.updatedAt = new Date();

    const db = getDB();

    const result = await db
      .collection("user")
      .updateOne({ email: userEmail }, { $set: updateData });

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    const updatedUser = await db.collection("user").findOne(
      { email: userEmail },
      {
        projection: {
          name: 1,
          email: 1,
          image: 1,
        },
      },
    );

    console.log("✅ Profile Updated:", userEmail);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("❌ Update profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
});

// ================= START SERVER =================

async function startServer() {
  try {
    console.log("🔄 Connecting to MongoDB...");

    await connectDB();

    console.log("✅ MongoDB Connected Successfully");

    const db = getDB();

    await db
      .collection("eventParticipants")
      .createIndex({ eventId: 1, userEmail: 1 }, { unique: true });

    await db
      .collection("volunteerRecords")
      .createIndex({ eventId: 1, userEmail: 1 }, { unique: true });

    await db
      .collection("certificates")
      .createIndex({ certificateId: 1 }, { unique: true });

    await db
      .collection("certificates")
      .createIndex({ eventId: 1, userEmail: 1 }, { unique: true });

    console.log("✅ MongoDB Indexes Created");

    app.listen(PORT, () => {
      console.log("====================================");
      console.log("🚀 ShobaiMile API Started");
      console.log(`🌐 Backend: http://localhost:${PORT}`);
      console.log(
        `💻 Frontend: ${process.env.FRONTEND_URL || "http://localhost:3000"}`,
      );
      console.log("====================================");
    });
  } catch (error) {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
