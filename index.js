import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import { connectDB, getDB } from "./config/mongodb.js";
import { verifyToken } from "./middleware/verifyToken.js";
import { ObjectId } from "mongodb";

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
      .find({
        eventDate: { $gte: new Date() },
      })
      .sort({ eventDate: 1 })
      .limit(6)
      .toArray();

    res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("Upcoming events error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load upcoming events",
    });
  }
});

// Protected Route Test
app.get("/api/protected", verifyToken, (req, res) => {
  res.status(200).json({
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

    // Validate required fields
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

    // Validate event date
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

    // Get authenticated user's email
    const creatorEmail = req.user.email;

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
      creatorEmail: creatorEmail.toLowerCase(),
      createdAt: new Date(),
    };

    const db = getDB();

    const result = await db.collection("events").insertOne(newEvent);

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      event: {
        _id: result.insertedId,
        ...newEvent,
      },
    });
  } catch (error) {
    console.error("Create event error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create event",
    });
  }
});

// Get Events Created by Logged-in User
app.get("/api/events/my-events", verifyToken, async (req, res) => {
  try {
    const db = getDB();

    const creatorEmail = req.user.email?.toLowerCase();

    if (!creatorEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const events = await db
      .collection("events")
      .find({ creatorEmail })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("My events error:", error);

    res.status(500).json({
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

    const creatorEmail = req.user.email?.toLowerCase();

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

    res.status(200).json({
      success: true,
      message: "Event updated successfully",
    });
  } catch (error) {
    console.error("Update event error:", error);

    res.status(500).json({
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

    const creatorEmail = req.user.email?.toLowerCase();

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

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Delete event error:", error);

    res.status(500).json({
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

    const userEmail = req.user.email?.toLowerCase();

    if (!userEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found",
      });
    }

    const db = getDB();

    const event = await db.collection("events").findOne({
      _id: new ObjectId(id),
      eventDate: { $gte: new Date() },
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Upcoming event not found",
      });
    }

    const existingJoin = await db.collection("eventParticipants").findOne({
      eventId: new ObjectId(id),
      userEmail,
    });

    if (existingJoin) {
      return res.status(409).json({
        success: false,
        message: "You have already joined this event",
      });
    }

    await db.collection("eventParticipants").insertOne({
      eventId: new ObjectId(id),
      userEmail,
      joinedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: "You joined the event successfully",
    });
  } catch (error) {
    console.error("Join event error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to join event",
    });
  }
});

// Get Events Joined by Logged-in User
app.get("/api/events/joined", verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email?.toLowerCase();

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
        {
          $match: { userEmail },
        },
        {
          $lookup: {
            from: "events",
            localField: "eventId",
            foreignField: "_id",
            as: "event",
          },
        },
        {
          $unwind: "$event",
        },
        {
          $sort: {
            "event.eventDate": 1,
          },
        },
        {
          $project: {
            _id: 1,
            joinedAt: 1,
            event: 1,
          },
        },
      ])
      .toArray();

    res.status(200).json({
      success: true,
      count: joinedEvents.length,
      events: joinedEvents,
    });
  } catch (error) {
    console.error("Joined events error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load joined events",
    });
  }
});

// Get all upcoming events
app.get("/api/events", async (req, res) => {
  try {
    const db = getDB();

    const events = await db
      .collection("events")
      .find({
        eventDate: { $gte: new Date() },
      })
      .sort({ eventDate: 1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("Get events error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load events",
    });
  }
});

// Get single event details
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

    res.status(200).json({
      success: true,
      event,
    });
  } catch (error) {
    console.error("Get event details error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load event details",
    });
  }
});

async function startServer() {
  try {
    await connectDB();

    const db = getDB();

    await db
      .collection("eventParticipants")
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
