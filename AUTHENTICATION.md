# Authentication Setup

## Overview
The application now includes user authentication with role-based access control.

## Default Admin Account
- **Email:** `admin@example.com`
- **Password:** `admin123`
- ⚠️ **Important:** Change this password in production!

## Features

### User Features
- User registration and login
- JWT-based authentication
- Secure password hashing with bcrypt
- Token stored in localStorage
- Auto-login on page refresh

### Admin Features
- Admin-only access to admin panel
- Protected admin endpoints
- Set/clear user guidance messages

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
  ```json
  { "email": "user@example.com", "password": "password123" }
  ```

- `POST /api/auth/login` - Login
  ```json
  { "email": "user@example.com", "password": "password123" }
  ```

- `GET /api/auth/me` - Get current user info (requires authentication)
  - Header: `Authorization: Bearer <token>`

### Protected Routes
- `POST /api/admin/message` - Set admin message (admin only)
- `DELETE /api/admin/message` - Clear admin message (admin only)
- `POST /api/subscribe` - Subscribe (requires authentication)

## Frontend Routes
- `/` - Main tracker page (public)
- `/login` - Login page
- `/signup` - Sign up page
- `/admin` - Admin panel (admin only)

## Security Notes
- Passwords are hashed with bcrypt
- JWT tokens expire after 7 days
- Admin routes protected with middleware
- In production:
  - Use environment variables for JWT_SECRET
  - Store users in a database (not in-memory)
  - Add rate limiting
  - Add HTTPS
  - Change default admin credentials

## User Flow

### Regular Users
1. Visit the tracker page
2. Can view fees and history without login
3. Must login to subscribe
4. Can register a new account

### Admin Users
1. Login with admin credentials
2. Access admin panel via header menu
3. Set guidance messages for all users
4. Can view protected admin features
