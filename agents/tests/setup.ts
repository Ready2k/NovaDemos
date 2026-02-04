/**
 * Jest setup file
 * Mocks external dependencies that cause issues in test environment
 */

// Mock Langfuse to avoid dynamic import issues
jest.mock('langfuse', () => ({
    Langfuse: jest.fn().mockImplementation(() => ({
        trace: jest.fn().mockReturnValue({
            id: 'mock-trace-id',
            update: jest.fn(),
            event: jest.fn(),
            span: jest.fn().mockReturnValue({
                id: 'mock-span-id',
                update: jest.fn(),
                end: jest.fn(),
            }),
            generation: jest.fn().mockReturnValue({
                id: 'mock-generation-id',
                update: jest.fn(),
                end: jest.fn(),
            }),
            end: jest.fn(),
        }),
        shutdown: jest.fn(),
        flushAsync: jest.fn().mockResolvedValue(undefined),
    })),
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
