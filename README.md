<div align="center">

# 🌱 ShobaiMile — Together, We Make a Difference

### A community-driven platform for volunteering, organizing events, and creating positive change.

[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-323330?style=for-the-badge&logo=javascript&logoColor=F7DF1E)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

</div>

---

## 📖 About the Project

**ShobaiMile** is a community-focused volunteering platform designed to bring people together, encourage meaningful participation, and create positive social change.

This repository contains the backend REST API that powers the platform's event management, volunteer participation, authentication, and related functionality.

Built with **Node.js, Express.js, and MongoDB**, the API provides protected routes, input validation, security middleware, and structured JSON responses.

## ✨ Key Features

- 🌍 **Event Management** — Create, update, delete, and retrieve community events.
- 📅 **Upcoming Events** — Retrieve upcoming events sorted by date.
- 🤝 **Volunteer Participation** — Allow users to join events while preventing duplicate participation.
- 👥 **Participant Management** — Enable event organizers to view participants in their own events.
- 📝 **My Events** — Retrieve events created by the authenticated user.
- 🔐 **Authentication** — Verify bearer tokens using JSON Web Key Sets (JWKS).
- ✅ **Input Validation** — Validate event details, categories, dates, image URLs, and volunteer guidelines.
- 📄 **PDF Generation** — Support PDF document generation for supported workflows.
- 🛡️ **Security Middleware** — Configure security headers, CORS, and API rate limiting.
- 🗄️ **MongoDB Integration** — Store and retrieve application data.
- 💚 **Health Check** — Check whether the API server is running.

## 🧰 Technology Stack

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime |
| Express.js | Backend REST API framework |
| MongoDB | NoSQL database |
| jose | JWT verification using JWKS |
| cors | Cross-origin resource sharing |
| helmet | HTTP security headers |
| express-rate-limit | API rate limiting |
| pdfkit | PDF document generation |
| dotenv | Environment variable management |
| nodemon | Automatic server restart during development |

## 📁 Project Structure

```text
shobaimile-server/
├── config/
│   └── mongodb.js
├── middleware/
│   └── verifyToken.js
├── index.js
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

## ⚙️ Getting Started

Follow these instructions to run the backend locally.

### Prerequisites

Make sure you have installed:

- Node.js (LTS recommended)
- npm
- MongoDB database
- The authentication service that issues tokens for protected routes

### 1. Clone the Repository

```bash
git clone https://github.com/fahimrahat58/shobaimile-server.git
```

Navigate to the project directory:

```bash
cd shobaimile-server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root directory and configure the required environment variables.

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
DB_NAME=your_database_name
FRONTEND_URL=http://localhost:3000
AUTH_BASE_URL=your_auth_service_base_url
```

Replace the placeholder values with your actual configuration.

**Important:** `AUTH_BASE_URL` should point to the base URL of the authentication service that exposes the `/api/auth/jwks` endpoint.

Never upload your `.env` file, database credentials, access tokens, or other secrets to GitHub.

### 4. Start the Development Server

```bash
npm run dev
```

To start the server normally, use:

```bash
npm start
```

The server uses port `5000` by default unless another port is configured.

## 🔌 API Endpoints

The following endpoints are available in the backend.

Protected endpoints require a valid bearer token.

| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | `/` | Check API server status | Public |
| GET | `/api/protected` | Verify authenticated access | Protected |
| GET | `/api/events/upcoming` | Retrieve upcoming events | Public |
| POST | `/api/events` | Create a new event | Protected |
| GET | `/api/events/my-events` | Retrieve the current user's events | Protected |
| PATCH | `/api/events/:id` | Update an event | Protected |
| DELETE | `/api/events/:id` | Delete an event | Protected |
| POST | `/api/events/:id/join` | Join an event | Protected |
| GET | `/api/events/:id/participants` | Retrieve event participants | Protected |

### Authentication Header

For protected routes, include the access token in your request headers:

```http
Authorization: Bearer <your_access_token>
```

Replace `<your_access_token>` with a valid token issued by the configured authentication service.

## 🗂️ Supported Event Categories

The API supports the following event categories:

- Cleanup
- Plantation
- Donation
- Education
- Food Support
- Animal Welfare
- Other

Events require valid information, including a title, description, category, image URL, location, future event date, and volunteer guidelines.

## 🔐 Security Features

Security measures implemented in the backend include:

- JWT verification through the configured authentication service's JWKS endpoint.
- CORS configuration using the `FRONTEND_URL` environment variable.
- HTTP security headers through Helmet.
- Rate limiting to help prevent excessive API requests.
- Validation of event input data and MongoDB document IDs.
- Ownership checks for event updates, deletions, and participant access.

## 💚 Health Check

After starting the server, visit:

```text
http://localhost:5000/
```

A successful response looks like this:

```json
{
  "success": true,
  "message": "ShobaiMile API is running!"
}
```

## 🚀 Deployment

To deploy the backend:

1. Push the project to your Git repository.
2. Create a Node.js web service on your preferred hosting platform.
3. Configure all required environment variables in the hosting dashboard.
4. Install dependencies using `npm install`.
5. Set `npm start` as the start command.
6. Ensure the MongoDB database and authentication service are accessible.
7. Test the health-check endpoint and protected API routes after deployment.

**Deployment checklist:**

- [ ] MongoDB connection configured.
- [ ] Environment variables added.
- [ ] Authentication service URL configured.
- [ ] Frontend origin configured correctly.
- [ ] API endpoints tested.
- [ ] Secrets excluded from GitHub.

## 🤝 Contributing

Contributions, suggestions, and bug reports are welcome!

If you would like to improve this project:

1. Fork the repository.
2. Create a new branch.
3. Make your changes.
4. Commit your changes with a meaningful message.
5. Open a pull request.

## 👨‍💻 Author

**Fahim Muntasir Rahat**

GitHub: [@fahimrahat58](https://github.com/fahimrahat58)

---

<div align="center">

### 🌱 Built with ❤️ to help communities make a difference.

**ShobaiMile — Together, we can create positive change.**

</div>
