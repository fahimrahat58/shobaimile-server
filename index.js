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

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }),
);

app.use(express.json());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
  }),
);

// Health Check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "ShobaiMile API is running!",
  });
});

// Get Latest 6 Upcoming Events
app.get("/api/events/upcoming", async (req, res) => {
  try {
    const db = getDB();

    const events = await db
      .collection("events")
      .find({ eventDate: { $gte: new Date() } })
      .sort({ eventDate: 1 })
      .limit(6)
      .toArray();

    return res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("Upcoming events error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load upcoming events",
    });
  }
});

// Protected Route Test
app.get("/api/protected", verifyToken, (req, res) => {
  return res.status(200).json({
    success: true,
    message: "You are authenticated!",
    user: req.user,
  });
});

// Create a New Event
app.post("/api/events", verifyToken, async (req, res) => {
  try {
    const { title, description, category, image, location, eventDate } =
      req.body;

    if (
      !title?.trim() ||
      !description?.trim() ||
      !category?.trim() ||
      !image?.trim() ||
      !location?.trim() ||
      !eventDate
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const parsedDate = new Date(eventDate);

    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid event date",
      });
    }

    if (parsedDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Event date must be in the future",
      });
    }

    const creatorEmail = req.user.email?.trim().toLowerCase();

    if (!creatorEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const newEvent = {
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      image: image.trim(),
      location: location.trim(),
      eventDate: parsedDate,
      creatorEmail,
      createdAt: new Date(),
    };

    const db = getDB();
    const result = await db.collection("events").insertOne(newEvent);

    return res.status(201).json({
      success: true,
      message: "Event created successfully",
      event: {
        _id: result.insertedId,
        ...newEvent,
      },
    });
  } catch (error) {
    console.error("Create event error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create event",
    });
  }
});

// Get Events Created by Logged-in User
app.get("/api/events/my-events", verifyToken, async (req, res) => {
  try {
    const creatorEmail = req.user.email?.trim().toLowerCase();

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

    return res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("My events error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load your events",
    });
  }
});

// Update Own Event
app.patch("/api/events/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    const { title, description, category, image, location, eventDate } =
      req.body;

    if (
      !title?.trim() ||
      !description?.trim() ||
      !category?.trim() ||
      !image?.trim() ||
      !location?.trim() ||
      !eventDate
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const parsedDate = new Date(eventDate);

    if (Number.isNaN(parsedDate.getTime()) || parsedDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid future event date",
      });
    }

    const creatorEmail = req.user.email?.trim().toLowerCase();

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
          title: title.trim(),
          description: description.trim(),
          category: category.trim(),
          image: image.trim(),
          location: location.trim(),
          eventDate: parsedDate,
          updatedAt: new Date(),
        },
      },
    );

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
    console.error("Update event error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update event",
    });
  }
});

// Delete Own Event
app.delete("/api/events/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    const creatorEmail = req.user.email?.trim().toLowerCase();

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
    console.error("Delete event error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete event",
    });
  }
});

// Join an Event
app.post("/api/events/:id/join", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    const userEmail = req.user.email?.trim().toLowerCase();

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

    return res.status(201).json({
      success: true,
      message: "You joined the event successfully",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already joined this event",
      });
    }

    console.error("Join event error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to join event",
    });
  }
});

// Get Participants of an Event (Event Organizer Only)
app.get("/api/events/:id/participants", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizerEmail = req.user.email?.trim().toLowerCase();

    if (!organizerEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
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
        const participantEmail = participant.userEmail?.trim().toLowerCase();

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

    return res.status(200).json({
      success: true,
      eventTitle: event.title,
      participants,
    });
  } catch (error) {
    console.error("Get event participants error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load participants",
    });
  }
});

// Get Events Joined by Logged-in User
app.get("/api/events/joined", verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email?.trim().toLowerCase();

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

    return res.status(200).json({
      success: true,
      count: joinedEvents.length,
      events: joinedEvents,
    });
  } catch (error) {
    console.error("Joined events error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load joined events",
    });
  }
});

// Verify a Participant's Attendance (Event Organizer Only)
app.post(
  "/api/events/:id/verify-participant",
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { userEmail, volunteerHours } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid event ID",
        });
      }

      const organizerEmail = req.user.email?.trim().toLowerCase();
      const participantEmail = userEmail?.trim().toLowerCase();
      const hours = Number(volunteerHours);

      if (!organizerEmail || !participantEmail) {
        return res.status(400).json({
          success: false,
          message: "Organizer and participant email are required",
        });
      }

      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        return res.status(400).json({
          success: false,
          message: "Volunteer hours must be greater than 0 and at most 24",
        });
      }

      const db = getDB();
      const eventId = new ObjectId(id);

      // Only the event organizer can verify attendance.
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

      // Allow verification only after the event's UTC calendar date ends.
      const eventDate = new Date(event.eventDate);
      const eventEnd = new Date(
        Date.UTC(
          eventDate.getUTCFullYear(),
          eventDate.getUTCMonth(),
          eventDate.getUTCDate() + 1,
        ),
      );

      if (new Date() < eventEnd) {
        return res.status(400).json({
          success: false,
          message: "Attendance can only be verified after the event date",
        });
      }

      const participant = await db.collection("eventParticipants").findOne({
        eventId,
        userEmail: participantEmail,
      });

      if (!participant) {
        return res.status(404).json({
          success: false,
          message: "This user has not joined the event",
        });
      }

      const volunteer = await db.collection("user").findOne({
        email: participantEmail,
      });

      if (!volunteer) {
        return res.status(404).json({
          success: false,
          message: "Volunteer profile not found",
        });
      }

      const existingRecord = await db.collection("volunteerRecords").findOne({
        eventId,
        userEmail: participantEmail,
      });

      if (existingRecord) {
        return res.status(409).json({
          success: false,
          message: "This volunteer's attendance has already been verified",
        });
      }

      // Count this volunteer's previously verified events.
      const previousVerifiedEvents = await db
        .collection("volunteerRecords")
        .countDocuments({ userEmail: participantEmail });

      // 50 points for participation + 20 points for every complete 2 hours.
      // A one-time 50-point bonus is awarded when the volunteer reaches 5 events.
      const participationPoints = 50;
      const hourPoints = Math.floor(hours / 2) * 20;
      const bonusPoints = previousVerifiedEvents === 4 ? 50 : 0;
      const totalPoints = participationPoints + hourPoints + bonusPoints;

      const certificateId = randomUUID();

      const record = {
        eventId,
        eventTitle: event.title,
        userEmail: participantEmail,
        volunteerName: volunteer.name || "Volunteer",
        volunteerHours: hours,
        participationPoints,
        hourPoints,
        bonusPoints,
        totalPoints,
        verifiedBy: organizerEmail,
        verifiedAt: new Date(),
        certificateId,
      };

      await db.collection("volunteerRecords").insertOne(record);

      const certificate = {
        certificateId,
        eventId,
        eventTitle: event.title,
        eventDate: event.eventDate,
        userEmail: participantEmail,
        volunteerName: record.volunteerName,
        volunteerHours: hours,
        issuedAt: new Date(),
      };

      await db.collection("certificates").insertOne(certificate);

      return res.status(201).json({
        success: true,
        message: "Attendance verified and certificate issued successfully",
        record: {
          eventTitle: event.title,
          volunteerName: record.volunteerName,
          volunteerHours: hours,
          participationPoints,
          hourPoints,
          bonusPoints,
          totalPoints,
          certificateId,
        },
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "This volunteer's attendance has already been verified",
        });
      }

      console.error("Attendance verification error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to verify attendance",
      });
    }
  },
);

// Get Logged-in User's Community Impact Summary
app.get("/api/impact/me", verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email?.trim().toLowerCase();

    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const db = getDB();

    const summary = await db
      .collection("volunteerRecords")
      .aggregate([
        { $match: { userEmail } },
        {
          $group: {
            _id: "$userEmail",
            totalPoints: { $sum: "$totalPoints" },
            volunteerHours: { $sum: "$volunteerHours" },
            completedEvents: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const impact = summary[0] || {
      totalPoints: 0,
      volunteerHours: 0,
      completedEvents: 0,
    };

    const badge =
      impact.totalPoints >= 500
        ? "Gold"
        : impact.totalPoints >= 100
          ? "Silver"
          : "Bronze";

    const nextMilestone =
      impact.totalPoints >= 500 ? null : impact.totalPoints >= 100 ? 500 : 100;

    return res.status(200).json({
      success: true,
      impact: {
        totalPoints: impact.totalPoints,
        volunteerHours: impact.volunteerHours,
        completedEvents: impact.completedEvents,
        badge,
        nextMilestone,
        pointsToNextMilestone: nextMilestone
          ? Math.max(0, nextMilestone - impact.totalPoints)
          : 0,
      },
    });
  } catch (error) {
    console.error("Impact summary error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load impact summary",
    });
  }
});

// Community Impact Leaderboard
app.get("/api/impact/leaderboard", async (req, res) => {
  try {
    const db = getDB();

    const leaderboard = await db
      .collection("volunteerRecords")
      .aggregate([
        {
          $group: {
            _id: "$userEmail",
            volunteerName: { $last: "$volunteerName" },
            totalPoints: { $sum: "$totalPoints" },
            volunteerHours: { $sum: "$volunteerHours" },
            completedEvents: { $sum: 1 },
          },
        },
        { $sort: { totalPoints: -1, completedEvents: -1 } },
        { $limit: 10 },
        {
          $project: {
            _id: 0,
            name: "$volunteerName",
            totalPoints: 1,
            volunteerHours: 1,
            completedEvents: 1,
          },
        },
      ])
      .toArray();

    return res.status(200).json({
      success: true,
      leaderboard,
    });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load leaderboard",
    });
  }
});

// Get Certificates of Logged-in User
app.get("/api/certificates/me", verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email?.trim().toLowerCase();

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

    return res.status(200).json({
      success: true,
      count: certificates.length,
      certificates,
    });
  } catch (error) {
    console.error("Certificates list error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load certificates",
    });
  }
});

// Download a Certificate as PDF (owner only)
app.get("/api/certificates/:id/download", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email?.trim().toLowerCase();

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

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ShobaiMile-Certificate-${id}.pdf"`,
    );

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 50,
    });

    doc.pipe(res);

    const pageWidth = doc.page.width;

    doc
      .rect(20, 20, pageWidth - 40, doc.page.height - 40)
      .lineWidth(3)
      .stroke("#16A34A");

    doc.moveDown(2);

    doc
      .font("Helvetica-Bold")
      .fontSize(30)
      .fillColor("#15803D")
      .text("SHOBAIMILE", { align: "center" });

    doc.moveDown(1);

    doc
      .fontSize(25)
      .fillColor("#1F2937")
      .text("CERTIFICATE OF VOLUNTEER PARTICIPATION", {
        align: "center",
      });

    doc.moveDown(1.5);

    doc
      .font("Helvetica")
      .fontSize(16)
      .fillColor("#374151")
      .text("This certificate is proudly presented to", {
        align: "center",
      });

    doc.moveDown(0.5);

    doc
      .font("Helvetica-Bold")
      .fontSize(28)
      .fillColor("#111827")
      .text(certificate.volunteerName, { align: "center" });

    doc.moveDown(0.8);

    doc
      .font("Helvetica")
      .fontSize(15)
      .fillColor("#374151")
      .text("For their valuable contribution as a volunteer at", {
        align: "center",
      });

    doc.moveDown(0.5);

    doc
      .font("Helvetica-Bold")
      .fontSize(21)
      .fillColor("#15803D")
      .text(certificate.eventTitle, { align: "center" });

    doc.moveDown(0.8);

    doc
      .font("Helvetica")
      .fontSize(14)
      .fillColor("#374151")
      .text(`Volunteer hours: ${certificate.volunteerHours}`, {
        align: "center",
      });

    doc.moveDown(0.5);

    doc.text(
      `Event date: ${new Date(certificate.eventDate).toLocaleDateString("en-GB")}`,
      { align: "center" },
    );

    doc.moveDown(1.5);

    doc
      .fontSize(10)
      .fillColor("#6B7280")
      .text(`Certificate ID: ${certificate.certificateId}`, {
        align: "center",
      });

    doc.moveDown(0.5);

    doc.text(
      `Issued: ${new Date(certificate.issuedAt).toLocaleDateString("en-GB")}`,
      { align: "center" },
    );

    doc.end();
  } catch (error) {
    console.error("Certificate PDF error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate certificate PDF",
      });
    }

    res.end();
  }
});

// Get All Upcoming Events
app.get("/api/events", async (req, res) => {
  try {
    const db = getDB();

    const events = await db
      .collection("events")
      .find({ eventDate: { $gte: new Date() } })
      .sort({ eventDate: 1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("Get events error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load events",
    });
  }
});

// Get Single Event Details
app.get("/api/events/:id", async (req, res) => {
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

    return res.status(200).json({
      success: true,
      event,
    });
  } catch (error) {
    console.error("Get event details error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load event details",
    });
  }
});

// Start Server
async function startServer() {
  try {
    await connectDB();

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

    app.listen(PORT, () => {
      console.log(`ShobaiMile API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
