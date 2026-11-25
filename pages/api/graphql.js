import { createYoga, createSchema } from 'graphql-yoga';
import { typeDefs } from '../../lib/graphql/typeDefs.js';
import { resolvers } from '../../lib/graphql/resolvers.js';
import prisma from '../../lib/prisma.js';
import { optionalUser } from '../../lib/session.js';

export const config = {
  api: {
    // Disable Next.js default body parser so GraphQL Yoga can handle requests directly
    bodyParser: false,
  },
};

const schema = createSchema({
  typeDefs,
  resolvers,
});

export default createYoga({
  schema,
  graphqlEndpoint: '/api/graphql',
  landingPage: true, // Enables built-in interactive GraphiQL playground
  context: async ({ req }) => {
    let currentUser = null;
    try {
      currentUser = await optionalUser(req);
    } catch (e) {
      currentUser = null;
    }

    return {
      req,
      prisma,
      currentUser
    };
  }
});
