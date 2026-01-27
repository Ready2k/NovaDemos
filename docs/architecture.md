# System Architecture

This document outlines the architecture of the Voice S2S application, highlighting the integration between the client application, Amazon Bedrock's Nova 2 Sonic, and the serverless backend via the AgentCore Gateway.

## Architecture Diagram

```mermaid
graph TD
    %% Styling
    classDef aws fill:#FF9900,stroke:#232F3E,color:white,stroke-width:2px;
    classDef client fill:#3F8624,stroke:#232F3E,color:white,stroke-width:2px;
    classDef bedrock fill:#00A4A6,stroke:#232F3E,color:white,stroke-width:2px;
    classDef compute fill:#D94F00,stroke:#232F3E,color:white,stroke-width:2px;
    classDef database fill:#3B48CC,stroke:#232F3E,color:white,stroke-width:2px;
    classDef ui fill:#8A2BE2,stroke:#232F3E,color:white,stroke-width:2px;

    %% Client Side (Browser)
    subgraph Browser ["Web Browser (Frontend-v2)"]
        UI["React UI / Dashboard"]:::ui
        WorkflowDesigner["Workflow Designer (JointJS)"]:::ui
        Visualizers["Three.js Visualizers"]:::ui
        Mic["Microphone Input"]:::ui
        Speakers["Speaker Output"]:::ui
    end

    %% Client / Server (Node.js)
    subgraph Client_App ["Voice S2S Backend Application"]
        WSServer["WebSocket Server"]:::client
        SonicClient["Sonic Client (AWS SDK)"]:::client
        ToolManager["Tool Manager"]:::client
        WorkflowEngine["Workflow Engine"]:::client
        SentimentParser["Sentiment Parser"]:::client
        GatewayClient["AgentCore Gateway Client"]:::client
    end

    %% AWS Cloud
    subgraph AWS_Cloud ["AWS Cloud"]
        
        %% Amazon Bedrock Service
        subgraph Bedrock ["Amazon Bedrock"]
            NovaSonic["Nova 2 Sonic Model\n(Streaming Audio/Text)"]:::bedrock
            BedrockAgent["Bedrock Agent\n(Banking Assistant)"]:::bedrock
            BedrockKB["Knowledge Bases for Bedrock"]:::bedrock
        end

        %% AgentCore Gateway (Bridge)
        subgraph Gateway ["AgentCore Gateway"]
            CoreGateway["AgentCore Gateway Endpoint\n(REST / MCP)"]:::aws
        end

        %% Serverless Backend
        subgraph Serverless ["Serverless Backend"]
            LambdaTools["Lambda Tool Implementations"]:::compute
            DynamoDB[("DynamoDB / Banking Data")]:::database
        end

    end

    %% Connections
    Mic --> UI
    UI <-->|"JSON/Binary (WebSocket)"| WSServer
    WSServer --> Speakers
    
    %% Internal Backend Flow
    WSServer <--> SonicClient
    SonicClient <--> ToolManager
    ToolManager --> WorkflowEngine
    SonicClient --> SentimentParser
    SentimentParser --> UI
    
    %% Nova Sonic Flow
    SonicClient <-->|"Bidirectional Stream (WebSocket)"| NovaSonic
    
    %% Tool Use Flow
    NovaSonic --"Tool Call"--> SonicClient
    SonicClient --"Execute Tool"--> GatewayClient
    GatewayClient --"MCP Request (SigV4)"--> CoreGateway
    
    %% Gateway to Lambda
    CoreGateway -->|"Invoke"| LambdaTools
    LambdaTools <--> DynamoDB

    %% Feedback Loop
    LambdaTools --"Result"--> CoreGateway
    CoreGateway --"Result"--> GatewayClient
    GatewayClient --"Result"--> ToolManager
    ToolManager --"Processed Result"--> SonicClient
    SonicClient --"Inject into LLM"--> NovaSonic
```


## Component Overview

### 1. Web Browser (Frontend-v2)
The frontend is a modern React application built with Next.js, providing a rich, interactive interface.
-   **React UI**: A responsive dashboard for chat and voice interaction.
-   **Workflow Designer**: A node-based visual editor using JointJS for building complex interaction flows.
-   **Three.js Visualizers**: High-performance audio visualizations including particle systems and fluid dynamics.
-   **Voice Processing**: Handles microphone input and speaker output with efficient binary streaming.

### 2. Node.js Backend Server
The backend orchestrates the communication between the browser and various AWS services.
-   **WebSocket Server**: Manages real-time binary and JSON communication with the frontend.
-   **Sonic Client**: Manages the persistent WebSocket connection to Amazon Nova 2 Sonic using the AWS SDK.
-   **Tool Manager & Workflow Engine**: Maps LLM tool calls to backend logic and manages the state of active workflows.
-   **Sentiment Parser**: Analyzes LLM output in real-time to extract sentiment tags and provide visual feedback.
-   **AgentCore Gateway Client**: Securely routes tool requests to the AgentCore infrastructure.

### 3. Amazon Bedrock (AI Layer)
-   **Nova 2 Sonic**: The primary speech-to-speech model, providing low-latency recognition and generation.
-   **Bedrock Agent**: Definable agentic behaviors and reasoning capabilities.
-   **Knowledge Bases**: RAG-powered retrieval for grounding AI responses in technical or private data.

### 4. AgentCore Gateway & Serverless Backend
-   **AgentCore Gateway**: A secure bridge (SigV4) that exposes standard endpoints for tool execution.
-   **AWS Lambda**: Serverless functions containing the business logic for banking operations (Balance, Transactions, Identity Verification).
-   **DynamoDB**: Scalable NoSQL database storing user account data and transaction logs.

