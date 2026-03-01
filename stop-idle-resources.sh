#!/bin/bash

# A simple script to stop AWS resources that cost money when left running
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
echo "Stopping Running AWS Resources..."
echo "========================================="

# 1. Stop all running EC2 instances
echo "Checking for running EC2 instances..."
RUNNING_EC2=$(aws ec2 describe-instances \
    --filters "Name=instance-state-name,Values=running" \
    --query "Reservations[*].Instances[*].InstanceId" \
    --output text)

if [ -n "$RUNNING_EC2" ] && [ "$RUNNING_EC2" != "None" ]; then
    echo "Found running EC2 instances:"
    for ID in $RUNNING_EC2; do
        echo "  - Stopping $ID..."
        aws ec2 stop-instances --instance-ids "$ID" --output json | grep '"Name"' | head -n 1
    done
else
    echo "  -> No running EC2 instances found."
fi
echo ""

# 2. Stop all available RDS DB instances 
# Note: This attempts to stop single instances. Clusters may need a separate command.
echo "Checking for active RDS DB instances..."
RUNNING_RDS=$(aws rds describe-db-instances \
    --query "DBInstances[?DBInstanceStatus=='available'].DBInstanceIdentifier" \
    --output text)

if [ -n "$RUNNING_RDS" ] && [ "$RUNNING_RDS" != "None" ]; then
    echo "Found running RDS instances:"
    for DB in $RUNNING_RDS; do
        echo "  - Stopping $DB..."
        # Ignore errors for DBs that can't be stopped (e.g. read replicas or aurora cluster members)
        aws rds stop-db-instance --db-instance-identifier "$DB" --output json 2>/dev/null | grep '"DBInstanceStatus"' || echo "      (Could not stop $DB. It may be part of a cluster or unsupported)"
    done
else
    echo "  -> No active RDS instances found."
fi
echo ""

# 3. Stop all running SageMaker Notebook instances
echo "Checking for running SageMaker Notebook instances..."
RUNNING_SAGEMAKER=$(aws sagemaker list-notebook-instances \
    --status-equals InService \
    --query "NotebookInstances[*].NotebookInstanceName" \
    --output text)

if [ -n "$RUNNING_SAGEMAKER" ] && [ "$RUNNING_SAGEMAKER" != "None" ]; then
    echo "Found running SageMaker Notebooks:"
    for NB in $RUNNING_SAGEMAKER; do
        echo "  - Stopping $NB..."
        aws sagemaker stop-notebook-instance --notebook-instance-name "$NB"
    done
else
    echo "  -> No active SageMaker Notebooks found."
fi
echo ""

# 4. Stop all running ECS Services (scale to 0)
echo "Checking for active ECS Services..."
CLUSTERS=$(aws ecs list-clusters --query "clusterArns" --output text 2>/dev/null)

if [ -n "$CLUSTERS" ] && [ "$CLUSTERS" != "None" ]; then
    ECS_FOUND=false
    for CLUSTER in $CLUSTERS; do
        SERVICES=$(aws ecs list-services --cluster "$CLUSTER" --query "serviceArns" --output text 2>/dev/null)
        if [ -n "$SERVICES" ] && [ "$SERVICES" != "None" ]; then
            for SERVICE in $SERVICES; do
                DESIRED_COUNT=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" --query "services[0].desiredCount" --output text 2>/dev/null)
                if [ -n "$DESIRED_COUNT" ] && [ "$DESIRED_COUNT" -gt 0 ] 2>/dev/null; then
                    echo "  - Stopping ECS Service ${SERVICE##*/} in cluster ${CLUSTER##*/}..."
                    aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --desired-count 0 > /dev/null 2>&1
                    ECS_FOUND=true
                fi
            done
        fi
    done
    if [ "$ECS_FOUND" = false ]; then
        echo "  -> No active ECS Services found."
    fi
else
    echo "  -> No ECS Clusters found."
fi
echo ""

echo "========================================="
echo "AWS resource stop requests have been sent!"
echo "Resources may take a few minutes to fully shut down."
echo "========================================="
