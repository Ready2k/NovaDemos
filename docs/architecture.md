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

    %% Client / On-Premise
    subgraph Client_App ["Voice S2S Application"]
        User["User (Voice/Audio)"]
        Backend["Node.js Backend Server"]:::client
        SonicClient["Sonic Client"]:::client
        GatewayClient["AgentCore Gateway Client"]:::client
    end

    %% AWS Cloud
    subgraph AWS_Cloud ["AWS Cloud"]
        
        %% Amazon Bedrock Service
        subgraph Bedrock ["Amazon Bedrock"]
            NovaSonic["Nova 2 Sonic Model\n(Streaming Audio/Text)"]:::bedrock
            BedrockAgent["Bedrock Agent\n(Banking Assistant)"]:::bedrock
        end

        %% AgentCore Gateway (Bridge)
        subgraph Gateway ["AgentCore Gateway"]
            CoreGateway["AgentCore Gateway Endpoint\n(REST / MCP)"]:::aws
        end

        %% Serverless Backend
        subgraph Serverless ["Serverless Backend"]
            LambdaBalance["Lambda: GetBalance"]:::compute
            LambdaHistory["Lambda: GetTransactions"]:::compute
            DynamoDB[("DynamoDB\n(Account Data)")]:::database
        end

    end

    %% Connections
    User <-->|"Bi-directional Audio"| Backend
    Backend <-->|"Audio Streams (WebSocket)"| SonicClient
    
    %% Nova Sonic Flow
    SonicClient <-->|"Listen/Speak (Bidirectional Stream)"| NovaSonic
    
    %% Tool Use Flow
    NovaSonic --"Tool Use Request"--> SonicClient
    SonicClient --"Forward Tool Call"--> GatewayClient
    GatewayClient --"MCP Call (SigV4)"--> CoreGateway
    
    %% Gateway to Lambda
    CoreGateway -->|"Invoke"| LambdaBalance
    CoreGateway -->|"Invoke"| LambdaHistory
    
    %% Lambda to Data
    LambdaBalance <-->|"Read Balance"| DynamoDB
    LambdaHistory <-->|"Read History"| DynamoDB

    %% Returns
    LambdaBalance --"Result"--> CoreGateway
    LambdaHistory --"Result"--> CoreGateway
    CoreGateway --"Result"--> GatewayClient
    GatewayClient --"Result"--> SonicClient
    SonicClient --"Tool Result"--> NovaSonic
```

## Component Overview

### 1. Client Application (Voice S2S)
The core of the user experience is the **Voice S2S Application**, a Node.js-based server that handles the bi-directional audio stream with the user.
-   **Sonic Client**: Manages the persistent WebSocket connection to Amazon Nova 2 Sonic. It handles the low-latency audio input and output, allowing for natural, interruptible conversations.
-   **AgentCore Gateway Client**: A specialized client that acts as a bridge for tool execution. When Nova 2 Sonic decides it needs to perform an action (like checking a balance), it sends a tool use request back to the Sonic Client. The Sonic Client then forwards this request to the AgentCore Gateway Client.

### 2. Amazon Bedrock (AI Layer)
-   **Nova 2 Sonic**: The primary speech-to-speech model. It provides very fast speech recognition and generation, capable of understanding speech, executing tool logic, and generating speech responses in real-time.
-   **Bedrock Agent**: Represents the "brain" of the banking assistant, defining the available actions and persona, though Nova 2 Sonic handles the direct interaction in this architecture.

### 3. AgentCore Gateway
This is a critical infrastructure component that bridges the gap between the generative AI models and external tools.
-   It exposes a standard endpoint (REST/MCP) that the client application can securely call using AWS SigV4 signing.
-   It routes these requests to the appropriate backend Lambda functions. This abstraction allows the AI model to call tools without needing direct network access to the backend infrastructure.

### 4. Serverless Backend
The actual business logic and data reside here.
-   **AWS Lambda**: Functions like `GetBalance` and `GetTransactions` contain the logic to retrieve user data. They are triggered by the AgentCore Gateway.
-   **DynamoDB**: The NoSQL database storing account information and transaction histories. The Lambda functions read from this database to fulfill user requests.
