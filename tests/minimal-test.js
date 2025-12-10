#!/usr/bin/env node

require('dotenv').config({ path: '../backend/.env' });

async function test() {
    console.log('Testing basic fetch...');
    
    try {
        const response = await fetch('https://httpbin.org/json', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);
        
    } catch (error) {
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

test();