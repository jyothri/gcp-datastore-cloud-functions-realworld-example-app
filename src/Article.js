const { db } = require('./Firestore.js');
const slugify = require('slugify');
const Utils = require('./Utils.js');

module.exports = {

  async create(aArticleData, aAuthorUsername) {
    // Get author data
    const docRef = db.collection('users').doc(aAuthorUsername);
    const findResult = await docRef.get();
    if (!findResult.exists) {
      throw new Error('User does not exist: [${aAuthorUsername}]');
    }
    const authorUser = findResult.data();

    const articleSlug = slugify('' + aArticleData.title) + '-' + (Math.random() * Math.pow(36, 6) | 0).toString(36);
    const timestamp = (new Date()).getTime();
    const newArticle = {
      slug: articleSlug,
      title: aArticleData.title,
      description: aArticleData.description,
      body: aArticleData.body,
      tagList: aArticleData.tagList ? aArticleData.tagList : [],
      createdAt: timestamp,
      updatedAt: timestamp,
      author: aAuthorUsername,
      favoritedBy: [],
    };
    const articleRef = db.collection('articles').doc(newArticle.slug);
    await articleRef.set(newArticle);
    newArticle.author = {
      username: aAuthorUsername,
      bio: authorUser.bio,
      image: authorUser.bio,
      following: false,
    };
    newArticle.favorited = false;
    newArticle.favoritesCount = 0;
    delete newArticle.favoritedBy;
    return newArticle;
  },

  async update(aSlug, aMutation, aUpdaterUsername) {
    const articleRef = db.collection('articles').doc(aSlug);
    const findResult = await articleRef.get();
    if (!findResult.exists) {
      throw new Error('Article not found: [${aSlug}]');
    }
    const article = findResult.data();

    if (aUpdaterUsername !== article.author) {
      throw new Error('Only author can update article');
    }

    if (aMutation.title) {
      article.title = aMutation.title;
    }
    if (aMutation.description) {
      article.description = aMutation.description;
    }
    if (aMutation.body) {
      article.body = aMutation.body;
    }
    await articleRef.set(article);
    return await this.get(aSlug, aUpdaterUsername);
  },

  async get(aSlug, aReaderUsername) {
    let findResult;
    const articleRef = db.collection('articles').doc(aSlug);
    findResult = await articleRef.get();
    if (!findResult.exists) {
      throw new Error('Article not found: [${aSlug}]');
    }
    const article = findResult.data();

    // Get author data
    const docRef = db.collection('users').doc(article.author);
    findResult = await docRef.get();
    if (!findResult.exists) {
      throw new Error('User does not exist: [${aAuthorUsername}]');
    }
    const authorUser = findResult.data();
    article.author = {
      username: authorUser.username,
      bio: authorUser.bio,
      image: authorUser.image,
      following: false,
    };

    // If reader's username is provided, populate following & favorited bits
    article.favorited = false;
    article.favoritesCount = article.favoritedBy.length;
    if (aReaderUsername) {
      article.author.following = authorUser.followers.includes(aReaderUsername);
      article.favoritedBy.includes(aReaderUsername);
    }
    delete article.favoritedBy;

    return article;
  },

  async delete(aSlug, aUsername) {
    let findResult;
    const articleRef = db.collection('articles').doc(aSlug);
    findResult = await articleRef.get();
    if (!findResult.exists) {
      throw new Error('Article not found: [${aSlug}]');
    }
    const article = findResult.data();

    const docRef = db.collection('users').doc(aUsername);
    findResult = await docRef.get();
    if (!findResult.exists) {
      throw new Error('User does not exist: [${aUsername}]');
    }
    const user = findResult.data();

    if (article.author !== user.username) {
      throw new Error(`Only author can delete article: [${article.author}]`);
    }
    await articleRef.delete();
    return null;
  },

  async getAll(options) {
    const usersRef = db.collection('users');
    let query = db.collection('articles');
    if (!options) {
      options = {};
    }

    if (options.tag) {
      query = query.where('tagList', 'array-contains', options.tag);
    } else if (options.author) {
      query = query.where('author', '=', options.author);
    } else if (options.favoritedBy) {
      query = query.where('favoritedBy', 'array-contains', options.favoritedBy);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    } else {
      query = query.limit(20);
    }

    if (options.offset) {
      query = query.offset(options.offset);
    }
    query.orderBy('createdAt', 'desc');

    const queryResult = await query.get();
    const articles = [];
    queryResult.forEach(article => {
      articles.push(article.data());
    });

    const userPromises = [];
    //const authors = [];
    for (const article of articles) {
      userPromises.push(usersRef.doc(article.author).get());
      //authors.push(await usersRef.doc(article.author).get());
    }
    const authors = await Promise.all(userPromises);
    for (let i = 0; i < authors.length; i++) {
      const authorUser = authors[i].data();
      const article = articles[i];
      article.author = {
        username: authorUser.username,
        bio: authorUser.bio,
        image: authorUser.image,
        following: false,
      };
      article.favorited = false;
      article.favoritesCount = article.favoritedBy.length;
      if (options.reader) {
        article.author.following = authorUser.followers.includes(options.reader);
        article.favorited = article.favoritedBy.includes(options.reader);
      }
      delete article.favoritedBy;
    }

    return articles;
  },

  async getFeed(aUsername, options) {
    const usersRef = db.collection('users');
    // Get author data
    const findResult = await usersRef.doc(aUsername).get();
    if (!findResult.exists) {
      throw new Error(`User not found: [${aUsername}]`);
    }
    const user = findResult.data();

    if (!options) {
      options = {};
    }
    if (!options.limit) {
      options.limit = 20;
    }
    if (!options.offset) {
      options.offset = 0;
    }

    // For each followed user, get authored articles
    let articles = [];
    for (const follow of user.following) {
      const followedUser = (await usersRef.doc(follow).get()).data();
      const query = db.collection('articles').where('author', '=', follow);

      const articlesByThisAuthor = await query.get();
      articlesByThisAuthor.forEach(articleResult => {
        const article = articleResult.data();
        article.favorited = article.favoritedBy.includes(aUsername);
        article.favoritesCount = article.favoritedBy.length;
        delete article.favoritedBy;
        article.author = {
          username: followedUser.username,
          bio: followedUser.bio,
          image: followedUser.image,
          following: true,
        };
        articles.push(article);
      });
    }

    // Sort merged articles by createdAt descending
    articles = articles.sort((a, b) => b.createdAt - a.createdAt);

    return articles.slice(options.offset, options.offset + options.limit);
  },

  async favoriteArticle(aSlug, aUsername) {
    return await this.mutateFavoriteBit(aSlug, aUsername, true);
  },

  async unfavoriteArticle(aSlug, aUsername) {
    return await this.mutateFavoriteBit(aSlug, aUsername, false);
  },

  async mutateFavoriteBit(aSlug, aUsername, aFavoriteBit) {
    // Verify user exists
    if (!aUsername) {
      throw new Error('User must be specified');
    }
    const favoriterUserDoc = db.collection('users').doc(aUsername);
    let findResult = await favoriterUserDoc.get();
    if (!findResult.exists) {
      throw new Error('User does not exist: [${aUsername}]');
    }

    // Get article to mutate
    const articleRef = db.collection('articles').doc(aSlug);
    findResult = await articleRef.get();
    if (!findResult.exists) {
      throw new Error('Article does not exist: [${aSlug}]');
    }
    const article = findResult.data();

    // First remove this author if already in list, and add back if favoriting
    article.favoritedBy = article.favoritedBy.filter(e => e !== aUsername);
    if (aFavoriteBit) {
      article.favoritedBy.push(aUsername);
    }
    await articleRef.set(article);
    article.favorited = aFavoriteBit;
    article.favoritesCount = article.favoritedBy.length;
    delete article.favoritedBy;

    // Get author data
    const authorUserDoc = db.collection('users').doc(article.author);
    findResult = await authorUserDoc.get();
    const authorUser = findResult.data();

    article.author = {
      username: authorUser.username,
      bio: authorUser.bio,
      image: authorUser.image,
      following: authorUser.followers.includes(aUsername),
    };

    return article;
  },

  async createComment(aSlug, aCommentAuthorUsername, aCommentBody) {
    const timestamp = (new Date()).getTime();
    const commentData = {
      body: aCommentBody,
      createdAt: timestamp,
      updatedAt: timestamp,
      author: aCommentAuthorUsername,
    };
    const commentReference = await db.collection('articles').doc(aSlug).collection('comments').add(commentData);
    commentData.id = commentReference.id;
    const commentAuthorUser = (await db.collection('users').doc(aCommentAuthorUsername).get()).data();
    commentData.author = {
      username: aCommentAuthorUsername,
      bio: commentAuthorUser.bio,
      image: commentAuthorUser.image,
      following: false,
    };
    return commentData;
  },

  async deleteComment(aSlug, aCommentId, aDeleterUsername) {
    const commentReference = db.collection('articles').doc(aSlug).collection('comments').doc(aCommentId);
    const commentSnapshot = await commentReference.get();
    if (!commentSnapshot.exists) {
      throw new Error(`Comment not found: [${aSlug}/${aCommentId}]`);
    }
    const comment = commentSnapshot.data();
    // Only comment's author can delete comment
    if (comment.author !== aDeleterUsername) {
      throw new Error('Only comment author can delete comment');
    }
    await commentReference.delete();
    return null;
  },

  async getAllComments(aSlug, aReaderUsername) {
    const commentResults = await db.collection('articles').doc(aSlug).collection('comments').get();
    let comments = [];
    commentResults.forEach(commentRef => {
      const comment = commentRef.data();
      comment.id = commentRef.id;
      comments.push(comment);
    });
    comments = comments.sort((a, b) => b.createdAt - a.createdAt);

    for (const comment of comments) {
      // Get comment author info
      const authorUser = (await db.collection('users').doc(comment.author).get()).data();
      comment.author = {
        username: authorUser.username,
        bio: authorUser.bio,
        image: authorUser.image,
        following: false,
      };
      if (aReaderUsername) {
        comment.author.following = authorUser.followers.includes(aReaderUsername);
      }
    }
    return comments;
  },

  async getAllTags() {
    const articles = await db.collection('articles').get();
    const dedupeObj = {};
    articles.forEach(articleResult => {
      dedupeObj[articleResult.data().tagList] = 1;
    });
    return Object.keys(dedupeObj);
  },

  testutils: {
    async __deleteAllArticles() {
      /* istanbul ignore next */
      return Utils.deleteCollection(db, 'articles', 10);
    },
    async __deleteAllComments() {
      /* istanbul ignore next */
      return Utils.deleteCollection(db, 'comments', 10);
    },
  },

};
