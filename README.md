# AI Engineering Organizational Memory Assistant

## Project Overview

This project demonstrates a Retrieval-Augmented Generation (RAG) system built using Amazon Bedrock Knowledge Bases, Flask, Docker, and AWS EC2.

The system allows engineers to query organizational knowledge using natural language. Engineering documents such as ADRs, incident postmortems, migration plans, runbooks, Jira tickets, and Slack discussions are stored in an S3 bucket, indexed by Amazon Bedrock Knowledge Bases, and queried through a Flask web application.

The assistant retrieves relevant document chunks and uses Claude to generate grounded answers based on the stored engineering knowledge.

---

## Architecture

User → Flask Web App → Amazon Bedrock Knowledge Base → Claude Model → Response

Components:

- Flask (Web Application)
- Amazon Bedrock Knowledge Base
- Amazon S3 (Document Storage)
- Claude (Foundation Model)
- Docker
- AWS EC2

---

## Dataset

The knowledge base contains:

- Architecture documents
- ADRs (Architecture Decision Records)
- Jira investigations
- Incident postmortems
- Slack discussions
- Migration plans
- Operational runbooks

Example questions:

- Why did CloudShop migrate from ECS to EKS?
- What caused the November 2025 payment service outage?
- Why was Redis chosen over Memcached?
- Who owns the payment service cache configuration?

---

## Deployment

The application was:

1. Containerized using Docker.
2. Published to Docker Hub.
3. Deployed on AWS EC2.
4. Connected to Amazon Bedrock Knowledge Bases.

Public deployment used during testing:

http://34.230.15.140:5000

---

## Screenshots

### Knowledge Base Overview

![Knowledge Base](ScreenShots/Screenshot%202026-06-02%20at%2017.21.17.png)



### EC2 Instance Running

![EC2](ScreenShots/Screenshot%202026-06-02%20at%2017.31.32.png)

### Docker Container Running

![Docker](ScreenShots/Screenshot%202026-06-02%20at%2017.32.12.png)

### Public Application

![Application](ScreenShots/Screenshot%202026-06-02%20at%2017.33.38.png)

---

## Technologies Used

- Python
- Flask
- Docker
- Amazon Bedrock
- Amazon S3
- AWS EC2
- Claude
- Boto3

---

## Author

Dan Hason

Computer Science Student