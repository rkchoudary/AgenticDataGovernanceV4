# Regulatory Knowledge Base

A graph-based knowledge base system for regulatory guidance documents from U.S. and Canadian banking regulators.

## Features

- Automated document retrieval from regulatory sources (FRB, OCC, FDIC, FinCEN, OSFI, FINTRAC)
- Document parsing and metadata extraction
- Graph-based storage with FalkorDB
- Natural language querying via AWS Bedrock Agent Core
- REST and GraphQL APIs

## Project Structure

```
├── src/
│   ├── regulatory_kb/       # Core library
│   │   ├── models/          # Data models
│   │   └── core/            # Logging, errors
│   └── handlers/            # Lambda handlers
├── infra/                   # AWS CDK infrastructure
│   └── stacks/              # CDK stacks
├── tests/                   # Test suite
└── pyproject.toml           # Project configuration
```

## Setup

```bash
# Install dependencies
pip install -e ".[dev,cdk]"

# Run tests
pytest

# Deploy infrastructure
cdk deploy --all
```

## Supported Regulators

- **U.S.**: Federal Reserve (FRB), OCC, FDIC, FinCEN
- **Canada**: OSFI, FINTRAC
