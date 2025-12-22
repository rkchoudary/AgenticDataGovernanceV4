# AgentCore Data Governance

Agentic AI Data Governance Operating Model using AWS Bedrock AgentCore.

## Overview

This project implements a multi-agent system for regulatory data governance using:
- **AgentCore Runtime**: Serverless deployment for AI agents
- **AgentCore Memory**: Persistent audit trails and conversation history
- **Strands Framework**: Tool-based AI agent development

## Agents

1. **Regulatory Intelligence Agent** - Scans regulatory sources, maintains report catalog
2. **Data Requirements Agent** - Parses templates, maps data elements
3. **CDE Identification Agent** - Scores and identifies critical data elements
4. **Data Quality Rule Agent** - Generates and executes validation rules
5. **Lineage Mapping Agent** - Captures data lineage from source to report
6. **Issue Management Agent** - Tracks and resolves data issues
7. **Documentation Agent** - Generates compliance artifacts
8. **Governance Orchestrator** - Coordinates all agents with human checkpoints

## Setup

```bash
# Install dependencies
pip install -e ".[dev]"

# Copy environment template
cp .env.example .env

# Configure your AWS credentials and memory IDs in .env
```

## Testing

```bash
# Run all tests
pytest

# Run property-based tests only
pytest tests/property/

# Run with verbose hypothesis output
HYPOTHESIS_PROFILE=debug pytest tests/property/
```

## Deployment

```bash
# Install AgentCore CLI
pip install bedrock-agentcore-starter-toolkit

# Create memory resources
agentcore memory create regulatory_agent_memory --wait

# Deploy agents
agentcore launch --agent RegulatoryIntelligenceAgent
```
