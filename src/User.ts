import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import * as Utils from './Utils';
import {db} from './Firestore';

/* istanbul ignore next */
const tokenSecret = process.env.SECRET ? process.env.SECRET : '3ee058420bc2';

class User { username: string; email?: string; password?: string; bio: string; image: string; followers?: Array<string>; following?: boolean; token?: string; }

async function verifyEmailIsNotTaken(aEmail): Promise<void> {
  const queryResult = await db.collection('users').where('email', '==', aEmail).get();
  if (!queryResult.empty) {
    throw new Error(`Email already taken: [${aEmail}]`);
  }
}

module.exports = {

  async create(aUserData): Promise<User> {
    // Verify username is not taken
    const findResult = await db.collection('users').doc(aUserData.username).get();
    if (findResult.exists) {
      throw new Error(`Username already taken: [${aUserData.username}]`);
    }

    await verifyEmailIsNotTaken(aUserData.email);

    // Add user
    const encryptedPassword = await bcrypt.hash(aUserData.password, 5);
    const userRecord: User = new User();
    userRecord.username = aUserData.username;
    userRecord.email = aUserData.email;
    userRecord.password = encryptedPassword;
    const userRef = db.collection('users').doc(userRecord.username);
    await userRef.set(Object.assign({}, userRecord));
    delete userRecord.password;
    userRecord.token = this.mintToken(aUserData.username);
    userRecord.username = aUserData.username;
    return userRecord;
  },

  async update(aCurrentUser, aUserMutation): Promise<User> {
    const docRef = db.collection('users').doc(aCurrentUser.username);
    const findResult = await docRef.get();
    if (!findResult.exists) {
      throw new Error(`User not found: [${aCurrentUser.username}]`);
    }

    const user = findResult.data();
    // Make requested mutations
    if (aUserMutation.email) {
      await verifyEmailIsNotTaken(aUserMutation.email);
      user.email = aUserMutation.email;
    }
    if (aUserMutation.password) {
      user.password = await bcrypt.hash(aUserMutation.password, 5);
    }
    if (aUserMutation.image) {
      user.image = aUserMutation.image;
    }
    if (aUserMutation.bio) {
      user.bio = aUserMutation.bio;
    }
    await docRef.set(user);
    const updatedUser = (await docRef.get()).data();
    return {
      email: updatedUser.email,
      token: aCurrentUser.token,
      username: updatedUser.username,
      bio: updatedUser.bio,
      image: updatedUser.image
    };
  },

  async login(aUserData): Promise<User> {
    // Get user with this email
    const queryResult = await db.collection('users').where('email', '==', aUserData.email).get();
    if (queryResult.empty || queryResult.size > 1) {
      throw new Error(`Email not found: [${aUserData.email}]`);
    }

    let foundDoc;
    queryResult.forEach(doc => {
      foundDoc = doc.data();
    });

    const foundUser = foundDoc;
    const passwordCheckResult = await bcrypt.compare(aUserData.password, foundUser.password);
    if (!passwordCheckResult) {
      throw new Error('Incorrect password');
    }
    return {
      email: foundUser.email,
      token: this.mintToken(foundUser.username),
      username: foundUser.username,
      bio: foundUser.bio,
      image: foundUser.image
    };
  },

  async getProfile(aUsername, aCurrentUser): Promise<User> {
    if (!aUsername) {
      throw new Error('User name must be specified');
    }
    const docRef = db.collection('users').doc(aUsername);
    const findResult = await docRef.get();
    const user = findResult.data();
    if (!user) {
      throw new Error(`User not found: [${aUsername}]`);
    }

    const profile: User = {
      username: aUsername,
      bio: user.bio,
      image: user.image,
      following: false,
    };

    if (aCurrentUser && aCurrentUser.username) {
      profile.following = user.followers.includes(aCurrentUser.username);
    }

    return profile;
  },

  async followUser(aFollowerUsername, aFollowedUsername): Promise<User> {
    return await this.mutateFollowing(aFollowerUsername, aFollowedUsername, true);
  },

  async unfollowUser(aFollowerUsername, aFollowedUsername): Promise<User> {
    return await this.mutateFollowing(aFollowerUsername, aFollowedUsername, false);
  },

  async mutateFollowing(aFollowerUsername, aFollowedUsername, aMutation): Promise<User> {
    // Add/remove "following" array of follower
    const followerDocRef = db.collection('users').doc(aFollowerUsername);
    const findResult = await followerDocRef.get();
    const followerUser = findResult.data();
    if (!followerUser) {
      throw new Error(`User not found: [${aFollowerUsername}]`);
    }
    if (aMutation) {
      if (!followerUser.following.includes(aFollowedUsername)) {
        followerUser.following.push(aFollowedUsername);
      }
    } else {
      followerUser.following = followerUser.following.filter(e => e != aFollowedUsername);
    }
    await followerDocRef.update({'following':followerUser.following});

    // Add/remove "followers" array of followed
    const followedDocRef = db.collection('users').doc(aFollowedUsername);
    const followedFindResult = await followedDocRef.get();
    const followedUser = followedFindResult.data();

    if (!followedUser) {
      throw new Error(`User not found: [${aFollowedUsername}]`);
    }
    if (aMutation) {
      if (!followedUser.followers.includes(aFollowerUsername)) {
        followedUser.followers.push(aFollowerUsername);
      }
    } else {
      followedUser.followers = followedUser.followers.filter(e => e != aFollowerUsername);
    }

    await followedDocRef.update({'followers': followedUser.followers});

    // Return profile of followed user
    return {
      username: aFollowedUsername,
      bio: followedUser.bio,
      image: followedUser.image,
      following: aMutation,
    };
  },

  // ===== Token managenement

  async authenticateToken(aToken): Promise<User> {
    const decoded = jwt.verify(aToken, tokenSecret);
    const username = decoded.username;
    const docRef = db.collection('users').doc(decoded.username);
    const findResult = await docRef.get();
    if (!findResult.exists) {
      throw new Error('Invalid token');
    }
    const foundUser = findResult.data();
    return {
      username,
      token: aToken,
      email: foundUser.email,
      bio: foundUser.bio,
      image: foundUser.image,
    };
  },

  mintToken(aUsername): string {
    return jwt.sign({
      username: aUsername
    }, tokenSecret, {
      expiresIn: '2 days'
    });
  },

  testutils: {
    async __deleteAllUsers(): Promise<void> {
      /* istanbul ignore next */
      return Utils.deleteCollection(db, 'users', 10);
    },
  },
};
