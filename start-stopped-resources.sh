#!/bin/bash

# A simple script to start AWS resources that were previously stopped
# Resources covered: EC2 instances, RDS DB instances, and SageMaker Notebook instances
#
# SBC Elastic IP: re-associated after the SBC instance reaches running state so
# it retains the same public IP (54.212.182.31) each time. The Docker container
# auto-restarts because it is launched with --restart unless-stopped.

# ── SBC config ─────────────────────────────────────────────────────────────────
SBC_INSTANCE_ID="i-0ecafa787315efb44"
SBC_EIP_ALLOC_ID="eipalloc-0c94bb2eb8749563d"
SBC_PUBLIC_IP="54.212.182.31"
AWS_REGION="us-west-2"
# ───────────────────────────────────────────────────────────────────────────────

echo "========================================="
echo "Starting Stopped AWS Resources..."
echo "========================================="

# 1. Start all stopped EC2 instances
echo "Checking for stopped EC2 instances..."
STOPPED_EC2=$(aws ec2 describe-instances \
    --region "$AWS_REGION" \
    --filters "Name=instance-state-name,Values=stopped" \
    --query "Reservations[*].Instances[*].InstanceId" \
    --output text)

if [ -n "$STOPPED_EC2" ] && [ "$STOPPED_EC2" != "None" ]; then
    echo "Found stopped EC2 instances:"
    for ID in $STOPPED_EC2; do
        echo "  - Starting $ID..."
        aws ec2 start-instances --region "$AWS_REGION" --instance-ids "$ID" --output json | grep '"Name"' | head -n 1
    done
else
    echo "  -> No stopped EC2 instances found."
fi
echo ""

# 1a. Re-associate SBC Elastic IP once the SBC instance is running
if echo "$STOPPED_EC2" | grep -q "$SBC_INSTANCE_ID"; then
    echo "Waiting for SBC instance $SBC_INSTANCE_ID to reach running state..."
    aws ec2 wait instance-running --region "$AWS_REGION" --instance-ids "$SBC_INSTANCE_ID"
    echo "  -> Instance is running."

    echo "Re-associating Elastic IP ($SBC_PUBLIC_IP) with SBC instance..."
    aws ec2 associate-address \
        --region "$AWS_REGION" \
        --instance-id "$SBC_INSTANCE_ID" \
        --allocation-id "$SBC_EIP_ALLOC_ID"

    echo ""
    echo "  ✔ SBC is back online at: $SBC_PUBLIC_IP"
    echo "  The Docker container will auto-restart (--restart unless-stopped)."
    echo ""
fi

# 2. Start all stopped RDS DB instances
echo "Checking for stopped RDS DB instances..."
STOPPED_RDS=$(aws rds describe-db-instances \
    --region "$AWS_REGION" \
    --query "DBInstances[?DBInstanceStatus=='stopped'].DBInstanceIdentifier" \
    --output text)

if [ -n "$STOPPED_RDS" ] && [ "$STOPPED_RDS" != "None" ]; then
    echo "Found stopped RDS instances:"
    for DB in $STOPPED_RDS; do
        echo "  - Starting $DB..."
        aws rds start-db-instance --region "$AWS_REGION" --db-instance-identifier "$DB" --output json 2>/dev/null | grep '"DBInstanceStatus"' || echo "      (Could not start $DB)"
    done
else
    echo "  -> No stopped RDS instances found."
fi
echo ""

# 3. Start all stopped SageMaker Notebook instances
echo "Checking for stopped SageMaker Notebook instances..."
STOPPED_SAGEMAKER=$(aws sagemaker list-notebook-instances \
    --region "$AWS_REGION" \
    --status-equals Stopped \
    --query "NotebookInstances[*].NotebookInstanceName" \
    --output text)

if [ -n "$STOPPED_SAGEMAKER" ] && [ "$STOPPED_SAGEMAKER" != "None" ]; then
    echo "Found stopped SageMaker Notebooks:"
    for NB in $STOPPED_SAGEMAKER; do
        echo "  - Starting $NB..."
        aws sagemaker start-notebook-instance --region "$AWS_REGION" --notebook-instance-name "$NB"
    done
else
    echo "  -> No stopped SageMaker Notebooks found."
fi
echo ""

echo "========================================="
echo "AWS resource start requests have been sent!"
echo "Resources may take a few minutes to fully spin up."
echo "========================================="
