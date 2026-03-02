#!/bin/bash

# A simple script to stop AWS resources that cost money when left running
# Resources covered: EC2 instances, RDS DB instances, and SageMaker Notebook instances
#
# SBC Elastic IP: disassociated before stopping the SBC instance so that AWS does
# not charge for an unassociated EIP while the instance is stopped (~$0.005/hr).

# ── SBC config ─────────────────────────────────────────────────────────────────
SBC_INSTANCE_ID="i-0ecafa787315efb44"
SBC_EIP_ALLOC_ID="eipalloc-0c94bb2eb8749563d"
AWS_REGION="us-west-2"
# ───────────────────────────────────────────────────────────────────────────────

echo "========================================="
echo "Stopping Running AWS Resources..."
echo "========================================="

# 0. Disassociate SBC Elastic IP (avoids ~$0.005/hr charge while instance is stopped)
echo "Disassociating SBC Elastic IP..."
ASSOC_ID=$(aws ec2 describe-addresses \
    --region "$AWS_REGION" \
    --allocation-ids "$SBC_EIP_ALLOC_ID" \
    --query 'Addresses[0].AssociationId' \
    --output text 2>/dev/null)
if [ -n "$ASSOC_ID" ] && [ "$ASSOC_ID" != "None" ]; then
    aws ec2 disassociate-address --region "$AWS_REGION" --association-id "$ASSOC_ID"
    echo "  -> EIP disassociated."
else
    echo "  -> EIP already disassociated or not found."
fi
echo ""

# 1. Stop all running EC2 instances
echo "Checking for running EC2 instances..."
RUNNING_EC2=$(aws ec2 describe-instances \
    --region "$AWS_REGION" \
    --filters "Name=instance-state-name,Values=running" \
    --query "Reservations[*].Instances[*].InstanceId" \
    --output text)

if [ -n "$RUNNING_EC2" ] && [ "$RUNNING_EC2" != "None" ]; then
    echo "Found running EC2 instances:"
    for ID in $RUNNING_EC2; do
        echo "  - Stopping $ID..."
        aws ec2 stop-instances --region "$AWS_REGION" --instance-ids "$ID" --output json | grep '"Name"' | head -n 1
    done
else
    echo "  -> No running EC2 instances found."
fi
echo ""

# 2. Stop all available RDS DB instances
# Note: This attempts to stop single instances. Clusters may need a separate command.
echo "Checking for active RDS DB instances..."
RUNNING_RDS=$(aws rds describe-db-instances \
    --region "$AWS_REGION" \
    --query "DBInstances[?DBInstanceStatus=='available'].DBInstanceIdentifier" \
    --output text)

if [ -n "$RUNNING_RDS" ] && [ "$RUNNING_RDS" != "None" ]; then
    echo "Found running RDS instances:"
    for DB in $RUNNING_RDS; do
        echo "  - Stopping $DB..."
        aws rds stop-db-instance --region "$AWS_REGION" --db-instance-identifier "$DB" --output json 2>/dev/null | grep '"DBInstanceStatus"' || echo "      (Could not stop $DB. It may be part of a cluster or unsupported)"
    done
else
    echo "  -> No active RDS instances found."
fi
echo ""

# 3. Stop all running SageMaker Notebook instances
echo "Checking for running SageMaker Notebook instances..."
RUNNING_SAGEMAKER=$(aws sagemaker list-notebook-instances \
    --region "$AWS_REGION" \
    --status-equals InService \
    --query "NotebookInstances[*].NotebookInstanceName" \
    --output text)

if [ -n "$RUNNING_SAGEMAKER" ] && [ "$RUNNING_SAGEMAKER" != "None" ]; then
    echo "Found running SageMaker Notebooks:"
    for NB in $RUNNING_SAGEMAKER; do
        echo "  - Stopping $NB..."
        aws sagemaker stop-notebook-instance --region "$AWS_REGION" --notebook-instance-name "$NB"
    done
else
    echo "  -> No active SageMaker Notebooks found."
fi
echo ""

echo "========================================="
echo "AWS resource stop requests have been sent!"
echo "Resources may take a few minutes to fully shut down."
echo "========================================="
