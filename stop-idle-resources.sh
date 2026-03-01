#!/bin/bash

# A simple script to stop AWS resources that cost money when left running
# Resources covered: EC2 instances, RDS DB instances, and SageMaker Notebook instances

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

echo "========================================="
echo "AWS resource stop requests have been sent!"
echo "Resources may take a few minutes to fully shut down."
echo "========================================="
