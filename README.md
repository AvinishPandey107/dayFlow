# DayFlow

### Your tasks. Your time. Your flow.

DayFlow is a personal productivity application that combines task management, calendar scheduling, and daily planning in one place. Designed for students and everyday productivity, DayFlow helps you organize tasks, manage deadlines, track progress, and stay focused.

Access your tasks from your Android phone or laptop, with cloud synchronization keeping everything up to date across devices.

---

## Features

### Task Management
- Create, edit, delete, and duplicate tasks.
- Mark tasks as completed with a checkbox.
- Set task priorities: Low, Medium, High, and Urgent.
- Add descriptions, notes, tags, and categories.
- Organize tasks using projects and subtasks.
- Search, filter, sort, and reorder tasks.
- View pending, completed, and overdue tasks.
- Undo accidental task completion.

### Task Scheduling & Duration
- Set start dates and deadlines.
- Schedule tasks for specific time periods.
- Support tasks lasting multiple days.
- Set estimated and actual task durations.
- Track task progress with visual indicators.
- Receive reminders before deadlines.
- Create tasks without a deadline.

### Calendar
- Monthly, weekly, daily, and agenda views.
- Display tasks and events together.
- Drag and drop tasks to reschedule them.
- Create tasks and events directly from the calendar.
- Color-coded categories and projects.
- Highlight today's date.
- View upcoming events and deadlines.

### Dashboard
- Today's tasks and events.
- Upcoming deadlines.
- Overdue tasks.
- Completed tasks.
- Daily completion percentage.
- Weekly productivity summary.
- Visual progress tracking.

### Productivity Tools
- Pomodoro focus timer.
- Focus mode for individual tasks.
- Habit tracker.
- Daily planning and end-of-day review.
- Weekly review.
- Recurring tasks.
- Task templates.
- Quick task creation.
- Natural language task entry.

### Cross-Device Synchronization
- Responsive interface for mobile, tablet, and desktop.
- Installable Progressive Web App (PWA).
- Cloud-based task storage.
- Automatic synchronization across devices.
- Offline task management.
- Automatic synchronization when internet connectivity returns.
- Secure user authentication.

### Additional Features
- Light and dark themes.
- Customizable settings.
- Notification reminders.
- Archive completed tasks.
- Data export and import.
- Backup and restore.
- Keyboard shortcuts.
- Google Calendar integration.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| React | User interface |
| TypeScript | Type safety |
| Tailwind CSS | Styling and responsive design |
| Supabase | Authentication and cloud backend |
| PostgreSQL | Persistent database |
| PWA | Installable cross-device application |
| Google Calendar API | Calendar integration |

---

## Application Design

DayFlow follows a clean and minimal design inspired by modern productivity applications.

**Desktop**
- Sidebar navigation
- Main task management area
- Calendar and upcoming tasks panel

**Mobile**
- Bottom navigation
- Touch-friendly task controls
- Compact calendar and agenda views
- Easy task creation

The interface prioritizes simplicity, accessibility, and efficient daily planning.

---

## Getting Started

### Prerequisites

Make sure you have the following installed:

- Node.js
- npm
- Git

You will also need a Supabase project for authentication and cloud database functionality.

### Installation

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/DayFlow.git
```

Navigate to the project directory:

```bash
cd DayFlow
```

Install dependencies:

```bash
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Replace the placeholder values with your Supabase project credentials.

Never expose service-role keys or other private credentials in frontend code.

### Run the Application

Start the development server:

```bash
npm run dev
```

Open the local URL provided by the development server in your browser.

---

## Database & Security

DayFlow uses Supabase and PostgreSQL for persistent data storage.

The database is designed to manage:

- User accounts
- Tasks
- Calendar events
- Categories and projects
- Recurring task rules
- Habits
- User preferences

Row Level Security (RLS) ensures that users can access only their own private data.

---

## Google Calendar Integration

DayFlow supports integration with Google Calendar to help manage existing events alongside personal tasks.

Planned integration capabilities include:

- Importing calendar events.
- Displaying events within DayFlow.
- Creating and updating events.
- Synchronizing calendar changes.
- Preventing duplicate events.

Google Calendar integration requires OAuth authentication and Google Calendar API configuration.

---

## Progressive Web App

DayFlow is designed as an installable Progressive Web App.

Users can install it on supported Android devices and desktop browsers without needing a separate native application.

PWA capabilities include:

- Installable application.
- Responsive interface.
- Offline access.
- Background synchronization where supported.
- App-like navigation and experience.

---

## Project Goals

DayFlow aims to make personal productivity simple and accessible by combining:

- Task management
- Time management
- Calendar scheduling
- Daily planning
- Productivity tracking

The goal is to help users spend less time organizing their work and more time actually completing it.

---

## License

This project is developed for personal productivity and educational purposes.

A license can be added to the repository when the project is ready for public distribution.
