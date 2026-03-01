#!/bin/bash

# A simple script to start AWS resources that were previously stopped
# Resources covered: EC2 instances, RDS DB instances, and SageMaker Notebook instances

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

echo "========================================="
echo "AWS resource start requests have been sent!"
echo "Resources may take a few minutes to fully spin up."
echo "========================================="
