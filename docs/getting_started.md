# Getting Started with Voice S2S

Welcome to the Real-Time Voice-to-Voice Assistant. This guide will help you set up and run the application for the first time.

## Prerequisites
- **Node.js** (v18 or higher)
- **AWS Account** with access to Bedrock and Nova models.
- **Microphone** and **Speakers**.

## Installation

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd Voice_S2S
   ```

2. **Install Backend Dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Configure Environment**
   Create a `.env` file in the `backend/` directory:
   ```bash
   cp .env.example .env
   ```
   
   Populate it with your AWS credentials:
   ```env
   NOVA_AWS_REGION=us-east-1
   NOVA_AWS_ACCESS_KEY_ID=your_key
   NOVA_AWS_SECRET_ACCESS_KEY=your_secret
   NOVA_SONIC_MODEL_ID=amazon.nova-2-sonic-v1:0
   ```

## Running the Application

1. **Build the Backend**
   ```bash
   npm run build
   ```

2. **Start the Server**
   ```bash
   npm start
   ```
   The server runs on port `8080`.

3. **Launch the Interface**
   Open **http://localhost:8080** in Chrome or Edge.

## First Interaction
1. Click **Connect** in the top right.
2. Allow microphone access.
3. Say **"Hello"** or **"What time is it?"**.
4. The assistant should respond with audio and text.

## Next Steps
- **Explore Tools**: Go to the **Tools Configuration** sidebar to see available tools.
- **Manage Tools**: Use the [Tool Manager](./tool_management.md) to add new capabilities.
- **Create Workflows**: Use the [Workflow Editor](./workflows.md) to design complex behaviors.
