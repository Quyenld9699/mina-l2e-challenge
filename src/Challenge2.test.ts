import {
    Field,
    Mina,
    PrivateKey,
    PublicKey,
    AccountUpdate,
    Provable,
    UInt32,
    Cache,
} from 'o1js';
import {
    Challenge2,
    CheckBatchOfMessages,
    Message,
    CheckBatchOfMessagesProof,
} from './Challenge2';

let proofsEnabled = false;

describe('Challenge2', () => {
    let deployerAccount: PublicKey,
        deployerKey: PrivateKey,
        senderAccount: PublicKey,
        senderKey: PrivateKey,
        zkAppAddress: PublicKey,
        zkAppPrivateKey: PrivateKey,
        zkApp: Challenge2;

    beforeAll(async () => {
        const cache = Cache.FileSystem('./caches');
        if (proofsEnabled) {
            Provable.log(CheckBatchOfMessages.analyzeMethods());
            Provable.log(Challenge2.analyzeMethods());
            await Challenge2.compile({ cache });
        }
        await CheckBatchOfMessages.compile({ cache });

        const Local = Mina.LocalBlockchain({ proofsEnabled });
        Mina.setActiveInstance(Local);
        ({ privateKey: deployerKey, publicKey: deployerAccount } =
            Local.testAccounts[0]);
        ({ privateKey: senderKey, publicKey: senderAccount } =
            Local.testAccounts[1]);
    });

    beforeEach(async () => {
        zkAppPrivateKey = PrivateKey.random();
        zkAppAddress = zkAppPrivateKey.toPublicKey();
        zkApp = new Challenge2(zkAppAddress);
        const txn = await Mina.transaction(deployerAccount, () => {
            AccountUpdate.fundNewAccount(deployerAccount);
            zkApp.deploy();
        });
        await txn.prove();
        await txn.sign([deployerKey, zkAppPrivateKey]).send();
    });

    it('generates and deploys the smart contract', async () => {
        const highestProcessedMessageNumber =
            zkApp.highestProcessedMessageNumber.get();
        expect(highestProcessedMessageNumber).toEqual(Field(0));
    });

    xit('Test if agentId = 0 can be valid without checking outer properties', async () => {
        let proof: CheckBatchOfMessagesProof =
            await CheckBatchOfMessages.baseCase();
        const messages: Message[] = [];
        let message = new Message({
            messageNumber: new Field(100),
            agentId: new UInt32(0),
            agentXLocation: new UInt32(15000),
            agentYLocation: new UInt32(20000),
            checkSum: new UInt32(0),
        });
        messages.push(message);

        for (let i = 0; i < messages.length; i++) {
            proof = await CheckBatchOfMessages.step(proof, messages[i]);
        }
        // check the proof
        const txn = await Mina.transaction(senderAccount, () => {
            zkApp.check(proof);
        });
        await txn.prove();
        await txn.sign([senderKey]).send();
        expect(zkApp.highestProcessedMessageNumber.get()).toEqual(Field(100));
    });

    it('Test messages number unordered', async () => {
        let proof: CheckBatchOfMessagesProof =
            await CheckBatchOfMessages.baseCase();
        const messages: Message[] = [];

        let message = new Message({
            messageNumber: new Field(3),
            agentId: new UInt32(0),
            agentXLocation: new UInt32(15000),
            agentYLocation: new UInt32(20000),
            checkSum: new UInt32(36500),
        });
        messages.push(message);

        // biggest messageNumber
        message = new Message({
            messageNumber: new Field(5),
            agentId: new UInt32(0),
            agentXLocation: new UInt32(0),
            agentYLocation: new UInt32(20000),
            checkSum: new UInt32(36500),
        });
        messages.push(message);

        // incorrect
        message = new Message({
            messageNumber: new Field(1),
            agentId: new UInt32(0),
            agentXLocation: new UInt32(0),
            agentYLocation: new UInt32(20000),
            checkSum: new UInt32(36500),
        });
        messages.push(message);

        for (let i = 0; i < messages.length; i++) {
            proof = await CheckBatchOfMessages.step(proof, messages[i]);
        }
        // check the proof
        const txn = await Mina.transaction(senderAccount, () => {
            zkApp.check(proof);
        });
        await txn.prove();
        await txn.sign([senderKey]).send();
        expect(zkApp.highestProcessedMessageNumber.get()).toEqual(Field(5));
    });

    it('All invalid message', async () => {
        let proof: CheckBatchOfMessagesProof =
            await CheckBatchOfMessages.baseCase();
        const messages: Message[] = [];

        // invalid checkSum
        let message = new Message({
            messageNumber: new Field(1),
            agentId: new UInt32(1000),
            agentXLocation: new UInt32(2000),
            agentYLocation: new UInt32(6000),
            checkSum: new UInt32(1),
        });
        messages.push(message);

        // X > Y
        message = new Message({
            messageNumber: new Field(2),
            agentId: new UInt32(1),
            agentXLocation: new UInt32(7000),
            agentYLocation: new UInt32(6000),
            checkSum: new UInt32(13010),
        });
        messages.push(message);

        // agentId > 3000
        message = new Message({
            messageNumber: new Field(3),
            agentId: new UInt32(4000),
            agentXLocation: new UInt32(0),
            agentYLocation: new UInt32(10000),
            checkSum: new UInt32(14000),
        });
        messages.push(message);

        // X > 15000
        message = new Message({
            messageNumber: new Field(4),
            agentId: new UInt32(10),
            agentXLocation: new UInt32(20000),
            agentYLocation: new UInt32(20000),
            checkSum: new UInt32(40010),
        });
        messages.push(message);

        // Y > 20000
        message = new Message({
            messageNumber: new Field(5),
            agentId: new UInt32(10),
            agentXLocation: new UInt32(5000),
            agentYLocation: new UInt32(50000),
            checkSum: new UInt32(55010),
        });
        messages.push(message);

        for (let i = 0; i < messages.length; i++) {
            proof = await CheckBatchOfMessages.step(proof, messages[i]);
        }
        // check the proof
        const txn = await Mina.transaction(senderAccount, () => {
            zkApp.check(proof);
        });
        await txn.prove();
        await txn.sign([senderKey]).send();
        expect(zkApp.highestProcessedMessageNumber.get()).toEqual(Field(0));
    });

    xit('Stress test with 51 message', async () => {
        let proof: CheckBatchOfMessagesProof =
            await CheckBatchOfMessages.baseCase();
        const messages: Message[] = [];
        for (let index = 0; index < 5; index++) {
            let message = new Message({
                messageNumber: new Field(index),
                agentId: new UInt32(1500),
                agentXLocation: new UInt32(15000),
                agentYLocation: new UInt32(20000),
                checkSum: new UInt32(36500),
            });
            messages.push(message);
        }

        for (let i = 0; i < messages.length; i++) {
            proof = await CheckBatchOfMessages.step(proof, messages[i]);
        }
        // check the proof
        const txn = await Mina.transaction(senderAccount, () => {
            zkApp.check(proof);
        });
        await txn.prove();
        await txn.sign([senderKey]).send();
        expect(zkApp.highestProcessedMessageNumber.get()).toEqual(Field(4));
    });
});
