# 🌾 Nogoman

Nogoman is a **web and mobile platform** designed to connect **agricultural workers** with **farm owners** in rural areas.  
The goal is to simplify job matching and opportunities in the agricultural sector — a model similar to "Uber", but adapted for farming communities.

---

## 🚀 Features

- 👨‍🌾 Farmers can **post jobs** (short-term or long-term tasks).  
- 👷 Workers can **search and apply** for nearby opportunities.  
- 📍 (WIP) Geolocation features to better match farmers and workers.  
- 📊 User role management (farmer vs worker).  
- 🔐 Secure authentication with JWT.  
- 🌍 Designed initially for Côte d’Ivoire, with potential to scale to other regions.

---

## 🛠 Tech Stack

**Frontend**
- React.js (web app)  
- React Native (mobile app)  
- Axios for API requests  

**Backend**
- Node.js + Express  
- PostgreSQL (via Supabase)  
- JSON Web Tokens (JWT) for authentication  
- Bcrypt for password hashing  

**Other**
- GitHub Actions (CI/CD)  

---

## 📂 Project Structure

---
## ⚡ Setup & Run

### 1. Backend

Clone the repo and install dependencies:

```bash
cd backend
npm install
```

Set your environment variables (```.env```)

```
DATABASE_URL=postgres://...
JWT_SECRET=your_secret_key
```
Run the server
```
node server.js
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```
For the React Native mobile app (still to be implemented):
```
npx expo start -c --tunnel
```

---

## 🔑 API Endpoints (Backend)

## 🌱 Roadmap

- <span style="color:blue">#DONE :</span> The whole backend is completed and a complete workflow is possible for the MVP
- <span style="color:green">#TODO :</span> The frontend for this MVP needs to be completed
- <span style="color:green">#TODO :</span> Adding a messaging system between users 
- <span style="color:green">#TODO :</span> Geolocation-based job search **#TODO**
- <span style="color:green">#TODO :</span> Deployment to cloud (Render/Vercel + Supabase) **#TODO**

## 👤 Author

Developed by Balloy Loïck – Computer Engineering student at EPITA (SSSE Major).

- Portfolio: [portfolio-link]

- GitHub: [https://github.com/loickballoy]

- LinkedIn: [https://www.linkedin.com/in/loick-balloy-332708203/]
