#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

async function extractApexCodeWithPlaywright() {
    let browser;
    
    try {
        console.log('🚀 Starting Apex Code Extractor (Playwright Version)...');
        
        // Get org info
        const orgData = JSON.parse(execSync('sf org display --json', { encoding: 'utf8' }));
        const orgUrl = orgData.result.instanceUrl;
        const username = orgData.result.username;
        const password = orgData.result.password;
        
        console.log(`📍 Org: ${orgUrl}`);
        console.log(`👤 User: ${username}`);
        
        if (!password) {
            throw new Error('Set SF_PASSWORD env var for non-scratch orgs');
        }
        
                // Create output directory and clean it before starting
        const outputDir = 'downloads';
        if (fs.existsSync(outputDir)) {
            const files = fs.readdirSync(outputDir);
            files.forEach(file => {
                const filePath = path.join(outputDir, file);
                fs.unlinkSync(filePath);
            });
            console.log('🧹 Cleaned existing download directory');
        } else {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Launch browser
        console.log('🌐 Launching browser...');
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        
        // Create a new page
        const page = await browser.newPage();
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        });
        
        // Login to Salesforce
        console.log('🔐 Logging in to Salesforce...');
        try {
            await page.goto('https://test.salesforce.com', { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(2000);
            
            if (page.isClosed()) {
                throw new Error('Page was closed unexpectedly');
            }
            
            const loginForm = await page.locator('#username, input[name="username"], .loginForm input[type="text"]').first();
            if (await loginForm.isVisible()) {
                await page.fill('#username, input[name="username"], .loginForm input[type="text"]', username);
                await page.fill('#password, input[name="password"], .loginForm input[type="password"]', password);
                
                const loginButton = await page.locator('#Login, input[type="submit"], button[type="submit"]').first();
                if (await loginButton.isVisible()) {
                    if (page.isClosed()) {
                        throw new Error('Page closed before button click');
                    }
                    
                    await loginButton.click();
                    
                    try {
                        await page.waitForLoadState('networkidle', { timeout: 30000 });
                    } catch (navError) {
                        if (page.isClosed()) {
                            throw new Error('Page was closed during navigation');
                        }
                    }
                } else {
                    throw new Error('Login button not found');
                }
            } else {
                throw new Error('Login form not found');
            }
        } catch (error) {
            console.error('❌ Login failed:', error.message);
            throw error;
        }
        
        await page.waitForTimeout(3000);
        
        // Discover dynamic Apex classes automatically
        console.log('🔍 Discovering dynamic Apex classes...');
        
        // Navigate to the Apex Classes page to find dynamic classes
        const apexClassesUrl = `${orgUrl}/01p?retURL=%2F01p&setupid=ApexClasses`;
        await page.goto(apexClassesUrl, { waitUntil: 'networkidle', timeout: 25000 });
        await page.waitForTimeout(3000);
        
        // Extract the list of dynamic Apex classes by scanning for herokuapplink references
        const classesToDownload = await page.evaluate(() => {
            const allLinks = Array.from(document.querySelectorAll('a'));
            const herokuClasses = [];
            
            allLinks.forEach(link => {
                const href = link.getAttribute('href');
                const text = link.textContent.trim();
                
                if (href && href.includes('herokuapplink') && text && text.length > 0) {
                    const match = href.match(/durableId=herokuapplink-([^&]+)/);
                    if (match) {
                        herokuClasses.push(match[1]);
                    }
                }
            });
            
            return [...new Set(herokuClasses)]; // Remove duplicates
        });
        
        if (classesToDownload.length === 0) {
            throw new Error('No dynamic Apex classes found. Please ensure the HerokuAppLink integration is properly configured.');
        }
        
        console.log(`📋 Found ${classesToDownload.length} dynamic Apex classes to download`);
        console.log(`📋 Classes: ${classesToDownload.join(', ')}`);
        
        // Process each class
        for (let i = 0; i < classesToDownload.length; i++) {
            const className = classesToDownload[i];
            console.log(`📄 Processing ${i + 1}/${classesToDownload.length}: ${className}`);
            
            // Construct the URL for this class
            const classUrl = `${orgUrl}/0xa000000000000?durableId=herokuapplink-${className}`;
            
            try {
                // Navigate to the class page using the same authenticated page
                await page.goto(classUrl, { waitUntil: 'networkidle', timeout: 25000 });
                await page.waitForTimeout(3000);
                
                // Wait for the class code to load
                try {
                    await page.waitForSelector('.codeBlock', { timeout: 8000 });
                } catch (waitError) {
                    // Continue anyway if element not found
                }
                
                // Extract the Apex code
                const classDetails = await page.evaluate(() => {
                    let extractedClassName = '';
                    let classCode = '';
                    
                    // Look for the class name in the page header
                    const headers = Array.from(document.querySelectorAll('h1, h2, h3, .pageTitle, .title'));
                    for (const header of headers) {
                        const text = header.textContent.trim();
                        if (text && text.length > 2 && text.length < 100 && !text.includes('Dynamic Apex Class')) {
                            extractedClassName = text;
                            break;
                        }
                    }
                    
                    // Look for the .codeBlock element (this is where the actual Apex code is)
                    const codeBlock = document.querySelector('.codeBlock');
                    if (codeBlock) {
                        // The code is in a table structure - extract from the second column
                        const codeTable = codeBlock.querySelector('table');
                        if (codeTable) {
                            // Find all rows in the table
                            const rows = codeTable.querySelectorAll('tbody tr');
                            const codeLines = [];
                            
                            rows.forEach(row => {
                                // Get the second column (index 1) which contains the actual code
                                const cells = row.querySelectorAll('td');
                                if (cells.length >= 2) {
                                    const codeCell = cells[1];
                                    
                                    // Get the HTML content to preserve formatting
                                    let lineHtml = codeCell.innerHTML;
                                    
                                    // Convert <br> tags to newlines
                                    lineHtml = lineHtml.replace(/<br\s*\/?>/gi, '\n');
                                    
                                    // Remove HTML tags but preserve content and spacing
                                    let lineText = lineHtml.replace(/<[^>]*>/g, '');
                                    
                                    // Decode HTML entities
                                    const textarea = document.createElement('textarea');
                                    textarea.innerHTML = lineText;
                                    lineText = textarea.value;
                                    
                                    // Clean up the line but preserve leading spaces
                                    lineText = lineText.trim();
                                    
                                    if (lineText) {
                                        codeLines.push(lineText);
                                    }
                                }
                            });
                            
                            // Join all lines together
                            classCode = codeLines.join('\n');
                        } else {
                            // Fallback to the old method if no table found
                            let htmlContent = codeBlock.innerHTML;
                            htmlContent = htmlContent.replace(/<br\s*\/?>/gi, '\n');
                            
                            const textarea = document.createElement('textarea');
                            textarea.innerHTML = htmlContent;
                            classCode = textarea.value.trim();
                        }
                        
                        // Convert any non-breaking spaces to regular spaces
                        classCode = classCode.replace(/\u00A0/g, ' ');
                        
                        // Clean up the code - remove line numbers if they exist
                        if (classCode) {
                            // Check if the code starts with line numbers
                            const lines = classCode.split('\n');
                            if (lines.length > 0 && /^\d+$/.test(lines[0].trim())) {
                                // Remove line numbers from the beginning of each line
                                const cleanedLines = lines.map(line => {
                                    const trimmed = line.trim();
                                    if (/^\d+$/.test(trimmed)) {
                                        return ''; // Empty line for line numbers
                                    } else if (trimmed.startsWith(' ')) {
                                        // Line with content, remove leading spaces
                                        return trimmed.replace(/^\s+/, '');
                                    } else {
                                        return trimmed;
                                    }
                                }).filter(line => line !== ''); // Remove empty lines
                                
                                classCode = cleanedLines.join('\n');
                            }
                        }
                    } else {
                        // If no .codeBlock found, try alternative selectors
                        const codeSelectors = ['pre', '.code', '.apexCode', 'textarea[readonly]'];
                        for (const selector of codeSelectors) {
                            const elements = document.querySelectorAll(selector);
                            for (const element of elements) {
                                const text = element.textContent || element.value || '';
                                if (text && text.includes('global class') && text.length > 100) {
                                    classCode = text.trim();
                                    break;
                                }
                            }
                            if (classCode) break;
                        }
                    }
                    
                    return {
                        className: extractedClassName,
                        code: classCode,
                        url: window.location.href,
                        pageTitle: document.title,
                        hasCodeBlock: !!codeBlock
                    };
                });
                
                if (classDetails.code.length > 0) {
                    // Save the code
                    const filename = className.replace(/[^a-zA-Z0-9_]/g, '_');
                    const filepath = path.join(outputDir, `${filename}.cls`);
                    fs.writeFileSync(filepath, classDetails.code);
                    console.log(`  ✅ Saved (${classDetails.code.length} chars)`);
                } else {
                    console.log(`  ❌ No code found`);
                }
                
            } catch (error) {
                console.error(`❌ Error processing class ${className}:`, error.message);
            }
            
                            // Small delay between requests
                if (i < classesToDownload.length - 1) {
                    await page.waitForTimeout(500);
                }
        }
        
        console.log('\n🎉 Extraction completed successfully!');
        console.log(`📁 Files saved to: ${path.resolve(outputDir)}`);
        
        // List downloaded files
        const files = fs.readdirSync(outputDir);
        console.log(`📋 Downloaded ${files.filter(f => f.endsWith('.cls')).length} Apex classes`);
        
    } catch (error) {
        console.error('💥 Script failed:', error.message);
        throw error;
    } finally {
        if (browser) {
            try {
                const closePromise = browser.close();
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Browser close timeout')), 5000)
                );
                
                await Promise.race([closePromise, timeoutPromise]);
            } catch (closeError) {
                try {
                    await browser.kill();
                } catch (killError) {
                    // Ignore kill errors
                }
            }
        }
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    // Add global timeout to prevent indefinite hanging
    const globalTimeout = setTimeout(() => {
        console.error('⏰ Global timeout reached - forcing exit');
        process.exit(1);
    }, 120000); // 2 minutes total timeout
    
    extractApexCodeWithPlaywright()
        .then(() => {
            clearTimeout(globalTimeout);
            console.log('🎉 Done!');
            process.exit(0); // Force exit after completion
        })
        .catch((error) => {
            clearTimeout(globalTimeout);
            console.error('💥 Script failed:', error);
            process.exit(1); // Force exit on error
        });
}

export default extractApexCodeWithPlaywright;
