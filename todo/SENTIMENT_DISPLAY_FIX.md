# Sentiment Display Fix - Frontend-v2

## Problem
Sentiment was displaying as "Negative 0%" instead of "Neutral 50%" when the sentiment score was 0 (neutral).

## Root Cause
The sentiment percentage calculation was incorrect:
```typescript
// OLD (WRONG)
const sentimentPercentage = (averageSentiment * 100).toFixed(0);
// When averageSentiment = 0: 0 * 100 = 0% ❌
```

The sentiment score ranges from **-1 to +1**, but the percentage was being calculated as if it ranged from **0 to 1**.

## Solution
Updated the calculation to properly convert the -1 to +1 scale to a 0-100% scale:

```typescript
// NEW (CORRECT)
const sentimentPercentage = ((averageSentiment + 1) * 50).toFixed(0);
// When averageSentiment = 0: (0 + 1) * 50 = 50% ✅
```

### Scale Conversion
| Sentiment Score | Old % | New % | Label |
|----------------|-------|-------|-------|
| -1.0 (Very Negative) | -100% | 0% | Negative |
| -0.5 | -50% | 25% | Negative |
| 0.0 (Neutral) | **0%** ❌ | **50%** ✅ | Neutral |
| +0.5 | 50% | 75% | Positive |
| +1.0 (Very Positive) | 100% | 100% | Positive |

## Changes Made

### File: `frontend-v2/components/layout/InsightPanel.tsx`

#### 1. Percentage Calculation (Line 40)
```typescript
// Convert sentiment from -1 to +1 scale to 0-100% scale
const sentimentPercentage = ((averageSentiment + 1) * 50).toFixed(0);
```

#### 2. Label Calculation (Lines 43-47)
```typescript
const getSentimentLabel = (sentiment: number): string => {
    const percentage = (sentiment + 1) * 50; // Convert to 0-100 scale
    if (percentage >= 70) return 'Positive';  // 70-100%
    if (percentage >= 30) return 'Neutral';   // 30-70%
    return 'Negative';                         // 0-30%
};
```

#### 3. Progress Circle (Lines 51-53)
```typescript
// Convert sentiment to 0-1 range for progress circle
const sentimentProgress = (averageSentiment + 1) / 2; // -1 to +1 becomes 0 to 1
const sentimentOffset = circumference - (sentimentProgress * circumference);
```

## Expected Behavior

### On Session Start (No Messages)
- **Sentiment Score**: 0 (neutral)
- **Display**: "Neutral 50%"
- **Progress Circle**: Half filled

### After Positive Messages
- **Sentiment Score**: 0.5
- **Display**: "Positive 75%"
- **Progress Circle**: 3/4 filled

### After Negative Messages
- **Sentiment Score**: -0.5
- **Display**: "Negative 25%"
- **Progress Circle**: 1/4 filled

## Testing

### 1. Start New Session
```
Expected: "Neutral 50%"
```

### 2. Send Positive Message
```
Expected: Percentage increases above 50%
Label changes to "Positive" when >= 70%
```

### 3. Send Negative Message
```
Expected: Percentage decreases below 50%
Label changes to "Negative" when < 30%
```

## Rebuild Required

Since this is a Next.js/React app (frontend-v2), you need to rebuild:

```bash
cd frontend-v2
npm run build
# or for development
npm run dev
```

## Notes

- This fix only applies to **frontend-v2** (Next.js version)
- The old **frontend** (vanilla JS) uses a different sentiment display system
- The circular progress gauge now correctly visualizes the sentiment
- Labels are now based on percentage thresholds:
  - **Positive**: 70-100%
  - **Neutral**: 30-70%
  - **Negative**: 0-30%

---

**Status**: ✅ Fixed  
**File Modified**: `frontend-v2/components/layout/InsightPanel.tsx`  
**Lines Changed**: 35-53  
**Rebuild Required**: Yes (Next.js app)
