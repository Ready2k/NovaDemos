#!/bin/bash

# A simple script to start AWS resources that were previously stopped
# Resources covered: EC2 instances, RDS DB instances, SageMaker Notebook instances, and ECS Services

# Stop the AWS CLI from using a pager
export AWS_PAGER=""

# Quick check to see if AWS CLI is configured with valid credentials and a default region
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "========================================="
    echo "ERROR: AWS credentials missing, expired, or no default region set!"
    echo "Please ensure you have authenticated (e.g., aws sso login) and have a region set."
    echo "========================================="
    exit 1
fi

echo "========================================="
echo "Starting Stopped AWS Resources..."
echo "========================================="

# 1. Start all stopped EC2 instances
echo "Checking for stopped EC2 instances..."
STOPPED_EC2=$(aws ec2 describe-instances \
    --filters "Name=instance-state-name,Values=stopped" \
    --query "Reservations[*].Instances[*].InstanceId" \
    --output text)

if [ -n "$STOPPED_EC2" ] && [ "$STOPPED_EC2" != "None" ]; then
    echo "Found stopped EC2 instances:"
    for ID in $STOPPED_EC2; do
        echo "  - Starting $ID..."
        aws ec2 start-instances --instance-ids "$ID" --output json | grep '"Name"' | head -n 1
    done
else
    echo "  -> No stopped EC2 instances found."
fi
echo ""

# 2. Start all stopped RDS DB instances 
echo "Checking for stopped RDS DB instances..."
STOPPED_RDS=$(aws rds describe-db-instances \
    --query "DBInstances[?DBInstanceStatus=='stopped'].DBInstanceIdentifier" \
    --output text)

if [ -n "$STOPPED_RDS" ] && [ "$STOPPED_RDS" != "None" ]; then
    echo "Found stopped RDS instances:"
    for DB in $STOPPED_RDS; do
        echo "  - Starting $DB..."
        # Ignore errors if DB cannot be started
        aws rds start-db-instance --db-instance-identifier "$DB" --output json 2>/dev/null | grep '"DBInstanceStatus"' || echo "      (Could not start $DB)"
    done
else
    echo "  -> No stopped RDS instances found."
fi
echo ""

# 3. Start all stopped SageMaker Notebook instances
echo "Checking for stopped SageMaker Notebook instances..."
STOPPED_SAGEMAKER=$(aws sagemaker list-notebook-instances \
    --status-equals Stopped \
    --query "NotebookInstances[*].NotebookInstanceName" \
    --output text)

if [ -n "$STOPPED_SAGEMAKER" ] && [ "$STOPPED_SAGEMAKER" != "None" ]; then
    echo "Found stopped SageMaker Notebooks:"
    for NB in $STOPPED_SAGEMAKER; do
        echo "  - Starting $NB..."
        aws sagemaker start-notebook-instance --notebook-instance-name "$NB"
    done
else
    echo "  -> No stopped SageMaker Notebooks found."
fi
echo ""

# 4. Start all stopped ECS Services (scale to 1)
echo "Checking for stopped ECS Services..."
CLUSTERS=$(aws ecs list-clusters --query "clusterArns" --output text 2>/dev/null)

if [ -n "$CLUSTERS" ] && [ "$CLUSTERS" != "None" ]; then
    ECS_FOUND=false
    for CLUSTER in $CLUSTERS; do
        SERVICES=$(aws ecs list-services --cluster "$CLUSTER" --query "serviceArns" --output text 2>/dev/null)
        if [ -n "$SERVICES" ] && [ "$SERVICES" != "None" ]; then
            for SERVICE in $SERVICES; do
                DESIRED_COUNT=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" --query "services[0].desiredCount" --output text 2>/dev/null)
                if [ -n "$DESIRED_COUNT" ] && [ "$DESIRED_COUNT" -eq 0 ] 2>/dev/null; then
                    echo "  - Starting ECS Service ${SERVICE##*/} in cluster ${CLUSTER##*/} (setting desired-count to 1)..."
                    aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --desired-count 1 > /dev/null 2>&1
                    ECS_FOUND=true
                fi
            done
        fi
    done
    if [ "$ECS_FOUND" = false ]; then
        echo "  -> No stopped ECS Services found."
    fi
else
    echo "  -> No ECS Clusters found."
fi
echo ""

echo "========================================="
echo "AWS resource start requests have been sent!"
echo "Resources may take a few minutes to fully spin up."
echo "========================================="
