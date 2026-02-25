# Cardbey Development Principles

## 🚀 AI-First Development Rule

**Core Principle:** If anything can be done by AI, we will find and integrate the APIs. Manual is just an option.

### Implementation Guidelines

1. **AI Integration Priority:**
   - When building new features, first evaluate if AI can automate or enhance the task
   - Research available AI APIs (OpenAI, Anthropic, Google AI, etc.) before implementing manual solutions
   - Integrate AI capabilities as the primary/default option
   - Provide manual alternatives as fallback or advanced options

2. **Examples of AI-First Approach:**
   - **Content Generation:** Use AI for text, images, layouts (DALL-E, GPT-4, Claude)
   - **Data Extraction:** Use Vision APIs for OCR, menu extraction, product recognition
   - **Content Enhancement:** Auto-generate captions, descriptions, hashtags
   - **Layout Design:** AI Layout Agent for automatic professional layouts
   - **Translation:** AI-powered i18n instead of manual translation
   - **Content Suggestions:** AI recommendations for templates, colors, styles

3. **Manual as Fallback:**
   - Manual options should be available for:
     - Users who prefer control
     - Edge cases AI cannot handle
     - Fine-tuning AI-generated content
     - When AI APIs are unavailable or rate-limited

4. **API Integration Standards:**
   - Use existing AI infrastructure (OpenAI, etc.) when possible
   - Implement graceful degradation when AI is unavailable
   - Cache AI responses when appropriate
   - Provide clear feedback on AI processing status

5. **Documentation:**
   - Document AI capabilities in feature specs
   - Note which features are AI-powered vs manual
   - Include API requirements in setup docs

---

## General Development Principles

### Code Quality
- Write clean, maintainable code
- Follow existing patterns and conventions
- Document complex logic and decisions
- Use TypeScript for type safety

### User Experience
- Prioritize user experience and usability
- Provide clear feedback and error messages
- Implement loading states for async operations
- Ensure responsive design across devices

### Performance
- Optimize for performance and scalability
- Use caching where appropriate
- Minimize API calls and network requests
- Implement lazy loading for large datasets

### Security
- Never expose API keys in client-side code
- Validate and sanitize user inputs
- Implement proper authentication and authorization
- Follow security best practices

### Testing
- Write tests for critical functionality
- Test edge cases and error scenarios
- Ensure backward compatibility when possible
- Test across different browsers and devices

---

## AI Integration Checklist

When implementing a new feature, ask:

- [ ] Can AI automate or enhance this task?
- [ ] What AI APIs are available for this use case?
- [ ] How can we integrate AI as the primary option?
- [ ] What manual fallback is needed?
- [ ] How do we handle AI failures gracefully?
- [ ] Is the AI integration documented?

---

**Last Updated:** 2025-01-27  
**Status:** Active Development Rule

