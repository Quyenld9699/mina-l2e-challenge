import {
    Field,
    SmartContract,
    state,
    State,
    method,
    Struct,
    ZkProgram,
    SelfProof,
    Void,
    Provable,
    Bool,
    UInt32,
} from 'o1js';

export class Message extends Struct({
    messageNumber: Field,
    agentId: UInt32,
    agentXLocation: UInt32,
    agentYLocation: UInt32,
    checkSum: UInt32,
}) {
    verifyAgentId(): Bool {
        // AgentId (should be between 0 and 3000)
        return Provable.if(
            this.agentId.lessThanOrEqual(new UInt32(3000)),
            Bool(true),
            Bool(false)
        );
    }

    verifyAgentXLocation(): Bool {
        return Provable.if(
            // Agent XLocation (should be between 0 and 15000)
            this.agentXLocation.lessThanOrEqual(new UInt32(15000)),
            Bool(true),
            Bool(false)
        );
    }

    verifyAgentYLocation(): Bool {
        // Agent YLocation (should be between 5000 and 20000) Agent YLocation should be greater than Agent XLocation
        return this.agentYLocation
            .greaterThan(this.agentXLocation)
            .and(this.agentYLocation.greaterThanOrEqual(new UInt32(5000)))
            .and(this.agentYLocation.lessThanOrEqual(new UInt32(20000)));
    }

    verifyChecksum(): Bool {
        // CheckSum is the sum of Agent ID , Agent XLocation,and Agent YLocation
        return Provable.if(
            this.agentId
                .add(this.agentXLocation)
                .add(this.agentYLocation)
                .equals(this.checkSum),
            Bool(true),
            Bool(false)
        );
    }

    isValid(): Bool {
        // If Agent ID is zero we don't need to check the other values, but this is still a valid message
        return this.agentId
            .equals(UInt32.zero)
            .or(
                this.verifyAgentId().and(
                    this.verifyAgentXLocation().and(
                        this.verifyAgentYLocation().and(this.verifyChecksum())
                    )
                )
            );
    }
}

export class CheckBatchOfMessagesOutput extends Struct({
    currentHighestMessageNumber: Field,
}) {}

export const CheckBatchOfMessages = ZkProgram({
    name: 'CheckBatchOfMessages',
    publicOutput: CheckBatchOfMessagesOutput,
    methods: {
        baseCase: {
            privateInputs: [],
            method(): CheckBatchOfMessagesOutput {
                return new CheckBatchOfMessagesOutput({
                    currentHighestMessageNumber: Field(0),
                });
            },
        },
        step: {
            privateInputs: [
                SelfProof<Void, CheckBatchOfMessagesOutput>,
                Message,
            ],
            method(
                earlierProof: SelfProof<Void, CheckBatchOfMessagesOutput>,
                messageDetails: Message
            ): CheckBatchOfMessagesOutput {
                // verify pre proof
                earlierProof.verify();

                let isValid = messageDetails.isValid();
                let currentHighestMessageNumber =
                    earlierProof.publicOutput.currentHighestMessageNumber;

                // In case the message number is not greater than the previous one, this means that this is a duplicate message. In this case it still should be processed
                let newHighestMessageNumber = Provable.if(
                    isValid.and(
                        messageDetails.messageNumber.greaterThan(
                            earlierProof.publicOutput
                                .currentHighestMessageNumber
                        )
                    ),
                    messageDetails.messageNumber,
                    currentHighestMessageNumber
                );

                return new CheckBatchOfMessagesOutput({
                    currentHighestMessageNumber: newHighestMessageNumber,
                });
            },
        },
    },
});

export class CheckBatchOfMessagesProof extends ZkProgram.Proof(
    CheckBatchOfMessages
) {}

export class Challenge2 extends SmartContract {
    @state(Field) highestProcessedMessageNumber = State<Field>();

    init() {
        super.init();
        this.highestProcessedMessageNumber.set(Field(0));
    }

    @method check(proof: CheckBatchOfMessagesProof) {
        proof.verify();

        let currentMessageNumber =
            this.highestProcessedMessageNumber.getAndRequireEquals();

        let proofMessageNumber = proof.publicOutput.currentHighestMessageNumber;

        this.highestProcessedMessageNumber.set(
            Provable.if(
                currentMessageNumber.lessThan(proofMessageNumber),
                proofMessageNumber,
                currentMessageNumber
            )
        );
    }
}
